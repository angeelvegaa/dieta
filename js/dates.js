/* Utilidades de fecha. Sin estado. */

export function pad(n){ return String(n).padStart(2, "0"); }

export function ymd(d){
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function daysIn(d){
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function abbr(name){
  const w = name.trim().split(/\s+/);
  if (w.length > 1) return w.map(x => x[0]).join("").slice(0, 3).toUpperCase();
  return name.slice(0, 4).toUpperCase();
}

export function fmt(n){
  const s = (Math.round(n * 10) / 10).toString().replace(".", ",");
  return n > 0 ? "+" + s : s;
}

export function addDays(ymdStr, delta){
  const [y, m, d] = ymdStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
}
