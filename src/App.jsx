// App.jsx（購入/未購入フラグ & 抽選モード対応版）
import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "booklist-v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function migrate(b) {
  // 既存データに purchased がなければ false を入れる
  if (typeof b.purchased !== "boolean") b.purchased = false;
  return b;
}

function loadBooks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((b) => b && typeof b.title === "string")
          .map(migrate)
      : [];
  } catch {
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function ensureHttps(u) {
  try {
    const hasProtocol = /^https?:\/\//i.test(u);
    return hasProtocol ? u : `https://${u}`;
  } catch {
    return u;
  }
}

export default function App() {
  const [books, setBooks] = useState(() => loadBooks());
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [purchasedInForm, setPurchasedInForm] = useState(false);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef(null);

  // 抽選モード: all/purchased/unpurchased
  const [drawMode, setDrawMode] = useState("all");

  useEffect(() => {
    saveBooks(books);
  }, [books]);

  const filtered = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q) ||
        (b.note || "").toLowerCase().includes(q)
    );
  }, [books, query]);

  const counts = useMemo(() => {
    let purchased = 0,
      unpurchased = 0;
    for (const b of filtered) {
      if (b.purchased) purchased++;
      else unpurchased++;
    }
    return { purchased, unpurchased, total: filtered.length };
  }, [filtered]);

  function resetForm() {
    setTitle("");
    setAuthor("");
    setUrl("");
    setNote("");
    setPurchasedInForm(false);
    setEditId(null);
  }

  function addOrUpdateBook(e) {
    e && e.preventDefault();
    const t = title.trim();
    if (!t) {
      alert("タイトルは必須です");
      return;
    }
    const normalizedUrl = url.trim() ? ensureHttps(url.trim()) : undefined;

    if (editId) {
      setBooks((prev) =>
        prev.map((b) =>
          b.id === editId
            ? {
                ...b,
                title: t,
                author: author.trim() || undefined,
                url: normalizedUrl,
                note: note.trim() || undefined,
                purchased: !!purchasedInForm,
              }
            : b
        )
      );
      alert("更新しました");
    } else {
      const newBook = {
        id: uid(),
        title: t,
        author: author.trim() || undefined,
        url: normalizedUrl,
        note: note.trim() || undefined,
        createdAt: Date.now(),
        purchased: !!purchasedInForm,
      };
      setBooks((prev) => [newBook, ...prev]);
      // alert("追加しました");
    }
    resetForm();
  }

  function removeBook(id) {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  function onEdit(book) {
    setTitle(book.title || "");
    setAuthor(book.author || "");
    setUrl(book.url || "");
    setNote(book.note || "");
    setPurchasedInForm(!!book.purchased);
    setEditId(book.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePurchased(id) {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, purchased: !b.purchased } : b))
    );
  }

  function pickRandom() {
    // 検索結果(filtered)から、さらに抽選モードで絞る
    let pool = filtered;
    if (drawMode === "purchased") pool = pool.filter((b) => b.purchased);
    if (drawMode === "unpurchased") pool = pool.filter((b) => !b.purchased);

    if (!pool.length) {
      const msgByMode =
        drawMode === "purchased"
          ? "（検索条件内に）購入済みの本がありません"
          : drawMode === "unpurchased"
          ? "（検索条件内に）未購入の本がありません"
          : "候補がありません";
      alert(`${msgByMode}。条件を変えてください。`);
      return;
    }
    const idx = Math.floor(Math.random() * pool.length);
    const p = pool[idx];
    setPicked(p);
    setShowModal(true);
  }

  function exportToFile(books) {
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-"); // ファイル名に使える形へ
    const blob = new Blob([JSON.stringify(books, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `books-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openFilePicker() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("JSONは配列ではありません");

        // サニタイズ
        const cleaned = parsed
          .map((b) => ({
            id: b.id || uid(),
            title: String(b.title || "").trim(),
            author: b.author ? String(b.author) : undefined,
            url: b.url ? String(b.url) : undefined,
            note: b.note ? String(b.note) : undefined,
            createdAt: b.createdAt || Date.now(),
            purchased: typeof b.purchased === "boolean" ? b.purchased : false,
          }))
          .filter((b) => b.title);

        // 置き換えorマージを選べるようにする
        const replace = window.confirm(
          `インポートします。\n既存: ${books.length}件 / 取り込み: ${cleaned.length}件\n\nOK=置き換え / キャンセル=マージ`
        );

        let next = [];
        if (replace) {
          next = cleaned;
        } else {
          // マージ（id優先で重複排除、id無い場合は「title+author」キーで重複排除）
          const map = new Map();

          // 既存を先に入れる
          for (const b of books) {
            const key = b.id || `${b.title}|${b.author || ""}`;
            if (!map.has(key)) map.set(key, b);
          }
          // 取り込み側で上書き（最新を優先）
          for (const b of cleaned) {
            const key = b.id || `${b.title}|${b.author || ""}`;
            map.set(key, { ...map.get(key), ...b });
          }
          next = Array.from(map.values());
        }

        // 並べ替え（新しい順）
        next.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setBooks(next);
        alert("インポートが完了しました");
      } catch (err) {
        console.error(err);
        alert("JSONの読み込みに失敗しました");
      } finally {
        // 同じファイルを続けて選んでもonchangeが発火するように
        e.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function clearAll() {
    if (!books.length) return;
    if (confirm("全て削除します。よろしいですか？")) {
      setBooks([]);
      alert("リストを空にしました");
    }
  }

  // ざっくりCSS（依存なし）
  const styles = {
    page: { minHeight: "100vh", background: "#f8fafc", padding: "24px" },
    container: { maxWidth: 960, margin: "0 auto" },
    card: {
      background: "#fff",
      borderRadius: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,.06)",
      padding: 16,
      marginTop: 16,
    },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    rowFull: { display: "grid", gridTemplateColumns: "1fr", gap: 12 },
    label: { fontSize: 12, fontWeight: 600 },
    input: {
      width: "100%",
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
    },
    textarea: {
      width: "100%",
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      minHeight: 80,
    },
    btn: {
      padding: "8px 12px",
      borderRadius: 12,
      border: "1px solid #cbd5e1",
      background: "#0ea5e9",
      color: "#fff",
      cursor: "pointer",
    },
    btnGhost: {
      padding: "8px 12px",
      borderRadius: 12,
      border: "1px solid #cbd5e1",
      background: "#fff",
      cursor: "pointer",
    },
    listItem: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 },
    badge: {
      background: "#f1f5f9",
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      marginLeft: 8,
    },
    tag: { fontSize: 12, color: "#64748b" },
    actionsRight: { marginLeft: "auto", display: "flex", gap: 8 },
    tiny: { fontSize: 12, color: "#64748b" },
    chip: (active) => ({
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      border: "1px solid #cbd5e1",
      background: active ? "#0ea5e9" : "#fff",
      color: active ? "#fff" : "#334155",
      cursor: "default",
    }),
    select: {
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      background: "#fff",
    },
    body: { margin: 0 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>読みたい本ランダマイザー</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.btnGhost} onClick={() => exportToFile(books)}>
              エクスポート
            </button>
            <button style={styles.btnGhost} onClick={openFilePicker}>
              インポート
            </button>
          </div>
        </div>
        {/* 隠しfile入力（コンポーネント直下どこでもOK） */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={onFileSelected}
        />
        {/* Form */}
        <div style={styles.card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>本を登録</h2>
          <form onSubmit={addOrUpdateBook} style={{ display: "grid", gap: 12 }}>
            <div style={styles.rowFull}>
              <label style={styles.label}>タイトル *</label>
              <input
                style={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：吾輩は猫である"
              />
            </div>
            <div style={styles.row}>
              <div>
                <label style={styles.label}>著者</label>
                <input
                  style={styles.input}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="夏目漱石"
                />
              </div>
              <div>
                <label style={styles.label}>URL（あれば）</label>
                <input
                  style={styles.input}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <div style={styles.rowFull}>
              <label style={styles.label}>メモ</label>
              <textarea
                style={styles.textarea}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="気になった理由や入手先など"
              />
            </div>

            {/* 購入済みフラグ（フォーム） */}
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={purchasedInForm}
                onChange={(e) => setPurchasedInForm(e.target.checked)}
              />
              購入済みにする
            </label>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" style={styles.btn}>
                {editId ? "更新" : "追加"}
              </button>
              {editId && (
                <button type="button" style={styles.btnGhost} onClick={resetForm}>
                  キャンセル
                </button>
              )}
              <div style={styles.actionsRight}>
                <input
                  style={styles.input}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="検索（タイトル・著者・メモ）"
                />
                {/* 抽選モードセレクト */}
                <select
                  value={drawMode}
                  onChange={(e) => setDrawMode(e.target.value)}
                  style={styles.select}
                  title="ランダムの対象"
                >
                  <option value="all">両方（{counts.total}）</option>
                  <option value="purchased">購入のみ（{counts.purchased}）</option>
                  <option value="unpurchased">未購入のみ（{counts.unpurchased}）</option>
                </select>
                <button type="button" style={styles.btn} onClick={pickRandom}>
                  ランダム
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* List */}
        <div style={styles.card}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>登録済みリスト</h2>
            <span style={styles.tiny}>
              表示中：{counts.total}（購入 {counts.purchased} / 未購入 {counts.unpurchased}）
            </span>
          </div>

          {books.length === 0 ? (
            <p style={{ color: "#64748b" }}>
              まだ本がありません。上のフォームから追加してください。
            </p>
          ) : (
            <ul style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {filtered.map((b) => (
                <li key={b.id} style={styles.listItem}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{b.title}</span>
                        {b.author && <span style={styles.badge}>{b.author}</span>}
                        <span style={styles.chip(b.purchased)}>
                          {b.purchased ? "購入済み" : "未購入"}
                        </span>
                      </div>
                      {b.note && (
                        <p style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "#334155" }}>
                          {b.note}
                        </p>
                      )}
                      {b.url && (
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "underline", fontSize: 14 }}
                        >
                          詳細を見る
                        </a>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!b.purchased}
                          onChange={() => togglePurchased(b.id)}
                        />
                        購入済み
                      </label>
                      <button style={styles.btnGhost} onClick={() => onEdit(b)}>
                        編集
                      </button>
                      <button style={styles.btnGhost} onClick={() => removeBook(b.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button
              style={{ ...styles.btnGhost, borderColor: "#ef4444", color: "#ef4444" }}
              onClick={clearAll}
              disabled={!books.length}
            >
              全削除
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 16 }}>
          ローカル保存（localStorage）対応。データはこの端末のブラウザ内に保存されます。
        </p>
      </div>

      {/* Modal */}
      {showModal && picked && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, padding: 20, width: "min(560px, 90vw)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800 }}>今日の一冊</h3>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{picked.title}</div>
              {picked.author && <div style={{ color: "#475569", marginTop: 4 }}>{picked.author}</div>}
              {picked.note && <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{picked.note}</p>}
              {picked.url && (
                <a href={picked.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  リンクを開く
                </a>
              )}
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                ステータス：{picked.purchased ? "購入済み" : "未購入"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#0ea5e9", color: "#fff" }} onClick={pickRandom}>
                もう一回
              </button>
              <button style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff" }} onClick={() => setShowModal(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
