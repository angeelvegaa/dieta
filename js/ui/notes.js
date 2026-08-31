/* Hoja de Notas: lista todas las notas de comidas y extras, con su fecha
   y a qué comida/extra corresponden. */

import { load, listKeys, isMonthKey } from "../storage.js";

async function renderNotes(){
  const keys = (await listKeys()).filter(isMonthKey).sort().reverse();
  const list = document.getElementById("notesList");
  const rows = [];
  for (const k of keys){
    const md = (await load(k)) || {};
    Object.keys(md).filter(dk => /^\d{4}-\d{2}-\d{2}$/.test(dk)).sort().reverse().forEach(day => {
      const entry = md[day];
      if (!entry) return;
      if (entry.__notes){
        Object.entries(entry.__notes).forEach(([meal, txt]) => {
          if (txt) rows.push({ day, label: meal, txt });
        });
      }
      if (entry.__extraNotes){
        entry.__extraNotes.filter(Boolean).forEach((txt, i) => {
          rows.push({ day, label: "Extra " + (i + 1), txt });
        });
      }
    });
  }
  list.innerHTML = rows.length ? "" : '<div class="hist-empty">Todavía no has añadido ninguna nota.<br>Mantén pulsada una casilla de comida o de extra para añadir una.</div>';
  rows.forEach(r => {
    const row = document.createElement("div");
    row.className = "hist-row";
    row.style.cursor = "default";
    row.innerHTML =
      '<div style="flex:1">' +
        '<div class="hm" style="text-transform:none">' + r.label + ' &middot; <span style="color:var(--ink-faint);font-weight:500">' + r.day + '</span></div>' +
        '<div style="font-size:.82rem;color:var(--ink-soft);margin-top:2px">' + r.txt.replace(/</g, "&lt;") + '</div>' +
      '</div>';
    list.appendChild(row);
  });
}

document.getElementById("notesBtn").onclick = () => {
  renderNotes();
  document.getElementById("notesSheet").classList.add("open");
};
document.getElementById("notesSheet").onclick = e => { if (e.target.id === "notesSheet") e.target.classList.remove("open"); };
