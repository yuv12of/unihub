/** Small HTML helpers for the emails the Apps Script sends (email clients need inline styles and hex colours). */
export const APP = "https://unihub-beta.vercel.app";
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const COLORS: Record<string, string> = { "20109": "#2f5bd3", "20474": "#12855a", "20407": "#8a3fc7" };
export const GREY = "#5d6880";

export const row = (color: string, main: string, sub: string) =>
  `<tr><td style="width:4px;background:${color};border-radius:2px"></td><td style="padding:6px 10px"><div style="font-size:15px;color:#16213a">${main}</div><div style="font-size:12px;color:${GREY}">${sub}</div></td></tr>`;
export const section = (title: string, body: string) => `<h2 style="font-size:16px;margin:22px 0 8px;color:#16213a">${title}</h2>${body}`;
export const table = (rows: string[]) => `<table style="border-collapse:separate;border-spacing:0 6px;width:100%">${rows.join("")}</table>`;
export const muted = (text: string) => `<p style="color:${GREY};margin:0">${text}</p>`;
export const button = (href: string, label: string) =>
  `<p style="margin-top:26px"><a href="${href}" style="display:inline-block;background:#16213a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${label}</a></p>`;
export const page = (inner: string) =>
  `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#16213a">\n${inner}\n</div>`;
