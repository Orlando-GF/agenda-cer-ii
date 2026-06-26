interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

type User = { id: number; name: string; username: string; role: "admin" | "atendente" };

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const error = (message: string, status = 400) => json({ error: message }, status);

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function clean(value: unknown, max = 200): string {
  return String(value ?? "").trim().slice(0, max);
}

function titleCaseWord(word: string): string {
  if (!word) return "";
  if (word.length > 1 && word === word.toUpperCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseText(value: unknown, max = 200): string {
  return clean(value, max)
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.split("-").map((part) => part.split("'").map(titleCaseWord).join("'")).join("-"))
    .join(" ");
}

function todaySaoPaulo(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function html(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

async function audit(env: Env, user: User, action: string, entityType: string, entityId: number | null, details: Record<string, unknown> = {}) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
    ).bind(user.id, action, entityType, entityId, JSON.stringify(details).slice(0, 2000)).run();
  } catch (cause) {
    console.warn("Audit log failed", cause);
  }
}

function cookie(request: Request, name: string): string | null {
  const found = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return found ? decodeURIComponent(found[1]) : null;
}

function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buffer, (n) => n.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt = randomToken(16), iterations = 20000): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    key,
    256,
  );
  const hash = Array.from(new Uint8Array(bits), (n) => n.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]) || 20000;
    const salt = parts[2];
    return (await hashPassword(password, salt, iterations)) === stored;
  }
  const [salt] = parts;
  const legacy = await hashPassword(password, salt, 120000);
  return legacy.split(":")[3] === parts[1];
}

async function currentUser(request: Request, env: Env): Promise<User | null> {
  const sessionId = cookie(request, "cer_session");
  if (!sessionId) return null;
  const user = await env.DB.prepare(
    `SELECT u.id, u.name, u.username, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`,
  ).bind(sessionId).first<User>();
  return user ?? null;
}

function sessionCookie(id: string, maxAge = 60 * 60 * 12): string {
  return `cer_session=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function requireUser(request: Request, env: Env, admin = false): Promise<User | Response> {
  const user = await currentUser(request, env);
  if (!user) return error("Faça login para continuar.", 401);
  if (admin && user.role !== "admin") return error("Acesso permitido somente ao administrador.", 403);
  return user;
}

function isResponse(value: User | Response): value is Response {
  return value instanceof Response;
}

async function authRoutes(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === "/api/status" && request.method === "GET") {
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM users").first<{ total: number }>();
    const user = await currentUser(request, env);
    return json({ needsSetup: Number(count?.total ?? 0) === 0, user });
  }

  if (path === "/api/setup" && request.method === "POST") {
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM users").first<{ total: number }>();
    if (Number(count?.total ?? 0) > 0) return error("O sistema já foi configurado.", 409);
    const data = await body(request);
    const name = titleCaseText(data.name, 100);
    const username = clean(data.username, 50);
    const password = clean(data.password, 100);
    if (!name || !username || password.length < 6) return error("Informe nome, usuário e uma senha com pelo menos 6 caracteres.");
    try {
      await env.DB.prepare(
        "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, 'admin')",
      ).bind(name, username, await hashPassword(password)).run();
      return json({ ok: true }, 201);
    } catch (cause) {
      console.error("Setup failed", cause);
      return error("Não foi possível criar o administrador. Tente uma senha diferente ou tente novamente em alguns segundos.", 500);
    }
  }

  if (path === "/api/login" && request.method === "POST") {
    const data = await body(request);
    const username = clean(data.username, 50);
    const password = clean(data.password, 100);
    const account = await env.DB.prepare(
      "SELECT id, name, username, role, password_hash FROM users WHERE username = ? AND active = 1",
    ).bind(username).first<User & { password_hash: string }>();
    if (!account || !(await verifyPassword(password, account.password_hash))) return error("Usuário ou senha incorretos.", 401);
    const id = randomToken();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))",
    ).bind(id, account.id).run();
    return json(
      { user: { id: account.id, name: account.name, username: account.username, role: account.role } },
      200,
      { "set-cookie": sessionCookie(id) },
    );
  }

  if (path === "/api/logout" && request.method === "POST") {
    const id = cookie(request, "cer_session");
    if (id) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  return null;
}

async function listSchedules(env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get("status") || "active";
  const from = clean(url.searchParams.get("from"), 10);
  const to = clean(url.searchParams.get("to"), 10);
  const professional = Number(url.searchParams.get("professional")) || 0;
  const kind = clean(url.searchParams.get("kind"), 20);
  const period = clean(url.searchParams.get("period"), 20);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = status === "active" ? 500 : 50;
  const offset = (page - 1) * limit;
  const today = todaySaoPaulo();
  const where: string[] = [];
  const params: unknown[] = [];
  if (status === "closed") {
    where.push("(s.active = 0 OR s.schedule_date < ?)");
    params.push(today);
  } else if (status === "all") {
    // sem filtro de situação
  } else {
    where.push("s.active = 1 AND s.schedule_date >= ?");
    params.push(today);
  }
  if (status !== "active") {
    if (from) {
      where.push("s.schedule_date >= ?");
      params.push(from);
    }
    if (to) {
      where.push("s.schedule_date <= ?");
      params.push(to);
    }
  }
  if (professional) {
    where.push("s.professional_id = ?");
    params.push(professional);
  }
  if (kind === "profissional" || kind === "exame") {
    where.push("s.kind = ?");
    params.push(kind);
  }
  if (["manha", "tarde", "noite"].includes(period)) {
    where.push("s.period = ?");
    params.push(period);
  }
  const orderDirection = status === "active" ? "ASC" : "DESC";
  const result = await env.DB.prepare(
    `SELECT s.*, p.name professional_name, p.specialty,
            COUNT(a.id) occupied
     FROM schedules s
     LEFT JOIN professionals p ON p.id = s.professional_id
     LEFT JOIN appointments a ON a.schedule_id = s.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY s.id
     ORDER BY s.schedule_date ${orderDirection}, lower(p.name), CASE s.period WHEN 'manha' THEN 1 WHEN 'tarde' THEN 2 WHEN 'noite' THEN 3 ELSE 4 END, s.time_label
     LIMIT ? OFFSET ?`,
  ).bind(...params, limit + 1, offset).all<Record<string, unknown> & { schedule_date: string; active: number }>();
  const rows = result.results ?? [];
  const items = rows.slice(0, limit).map((schedule) => ({
    ...schedule,
    active: Number(schedule.active) === 1 && String(schedule.schedule_date) >= today ? 1 : 0,
  }));
  return json({ items, page, hasMore: rows.length > limit });
}

async function scheduleDetails(env: Env, id: number): Promise<Response> {
  const schedule = await env.DB.prepare(
    `SELECT s.*, p.name professional_name, p.specialty,
            COUNT(a.id) occupied
     FROM schedules s
     LEFT JOIN professionals p ON p.id = s.professional_id
     LEFT JOIN appointments a ON a.schedule_id = s.id
     WHERE s.id = ? GROUP BY s.id`,
  ).bind(id).first<{ kind: string } & Record<string, unknown>>();
  if (!schedule) return error("Agenda não encontrada.", 404);
  const normalizedSchedule = {
    ...schedule,
    active: Number(schedule.active) === 1 && String(schedule.schedule_date) >= todaySaoPaulo() ? 1 : 0,
  };
  const appointments = await env.DB.prepare(
    `SELECT a.id, a.slot_number, a.observation, a.created_at, p.id patient_id, p.record_number, p.name patient_name,
            u.name created_by_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = a.created_by
     WHERE a.schedule_id = ?
     ORDER BY a.slot_number`,
  ).bind(id).all<Record<string, unknown> & { id: number }>();
  return json({ schedule: normalizedSchedule, appointments: appointments.results ?? [] });
}

async function printSchedulePage(request: Request, env: Env, id: number): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) {
    return new Response("<!doctype html><meta charset=\"utf-8\"><p>Faça login para imprimir esta agenda.</p>", {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  const detail = await scheduleDetails(env, id);
  if (!detail.ok) return detail;
  const data = await detail.json() as {
    schedule: Record<string, unknown> & { kind: string; professional_name?: string; schedule_date: string; period: string; time_label?: string; occupied: number; capacity: number };
    appointments: Array<Record<string, unknown> & { slot_number: number; record_number: string; patient_name: string; observation: string }>;
  };
  const schedule = data.schedule;
  const isExam = schedule.kind === "exame";
  const rowsBySlot = new Map<number, typeof data.appointments[number]>();
  for (const appointment of data.appointments) rowsBySlot.set(Number(appointment.slot_number), appointment);
  const capacity = Number(schedule.capacity);
  const rows = Array.from({ length: capacity }, (_, index) => {
    const slot = index + 1;
    const appointment = rowsBySlot.get(slot);
    return `<tr><td class="num">${slot}</td><td>${html(appointment?.record_number)}</td><td>${html(appointment?.patient_name)}</td><td>${html(appointment?.observation)}</td></tr>`;
  }).join("");
  const periodName: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
  const markup = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Impressão da agenda</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111}
    .print-bar{display:flex;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #ddd}
    .print-bar button{border:0;border-radius:5px;padding:9px 14px;font-weight:bold;background:#176b5b;color:#fff;cursor:pointer}
    .print-bar button.secondary{background:#e8eeee;color:#20312d}
    .print-bar small{align-self:center;color:#555}
    h1{font-size:22px;margin:0 0 6px}p{margin:0 0 18px;color:#444}
    .summary{display:flex;gap:12px;margin:14px 0}.box{border:1px solid #ccc;padding:8px 10px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}
    th{background:#f0f0f0}.num{width:35px;text-align:center}.record{width:85px}.obs{width:180px}
    @page{margin:12mm}@media print{.print-bar{display:none}body{margin:0}}
  </style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Imprimir</button><button class="secondary" onclick="closePrintPage()">Fechar</button><small>Se não abrir a janela, use Ctrl+P nesta página.</small></div>
  <h1>${html(schedule.professional_name || "Profissional não informado")}</h1>
  <p>${isExam ? "Agenda de exame" : "Consulta"} • ${html(schedule.schedule_date.split("-").reverse().join("/"))} • ${html(periodName[schedule.period] || schedule.period)}${schedule.time_label ? ` • ${html(schedule.time_label)}` : ""}</p>
  <div class="summary"><div class="box"><strong>${html(schedule.occupied)}</strong> agendados</div><div class="box"><strong>${html(schedule.capacity)}</strong> vagas</div></div>
  <table><thead><tr><th class="num">#</th><th class="record">Prontuário</th><th>Paciente</th><th class="obs">Observação</th></tr></thead><tbody>${rows}</tbody></table>
  <script>
    function closePrintPage(){
      if(window.opener){ window.close(); return; }
      if(history.length > 1){ history.back(); return; }
      location.href = "/";
    }
  </script>
</body>
</html>`;
  return new Response(markup, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const auth = await authRoutes(request, env, path);
  if (auth) return auth;

  const adminPath = path.startsWith("/api/users");
  const user = await requireUser(request, env, adminPath);
  if (isResponse(user)) return user;

  if (path === "/api/professionals" && request.method === "GET") {
    return json((await env.DB.prepare("SELECT * FROM professionals ORDER BY active DESC, name").all()).results);
  }
  if (path === "/api/professionals" && request.method === "POST") {
    const data = await body(request);
    const name = titleCaseText(data.name, 120);
    const specialty = titleCaseText(data.specialty, 120);
    if (!name) return error("Informe o nome do profissional.");
    const result = await env.DB.prepare(
      "INSERT INTO professionals (name, specialty) VALUES (?, ?)",
    ).bind(name, specialty).run();
    await audit(env, user, "professional.create", "professional", Number(result.meta.last_row_id), { name });
    return json({ id: result.meta.last_row_id }, 201);
  }
  const professionalId = path.match(/^\/api\/professionals\/(\d+)$/);
  if (professionalId && request.method === "PATCH") {
    const data = await body(request);
    const name = titleCaseText(data.name, 120);
    const specialty = titleCaseText(data.specialty, 120);
    await env.DB.prepare(
      "UPDATE professionals SET name = ?, specialty = ?, active = ? WHERE id = ?",
    ).bind(name, specialty, data.active ? 1 : 0, Number(professionalId[1])).run();
    await audit(env, user, "professional.update", "professional", Number(professionalId[1]), { name, active: !!data.active });
    return json({ ok: true });
  }

  if (path === "/api/users" && request.method === "GET") {
    return json((await env.DB.prepare("SELECT id, name, username, role, active, created_at FROM users ORDER BY active DESC, name").all()).results);
  }
  if (path === "/api/users" && request.method === "POST") {
    const data = await body(request);
    const name = titleCaseText(data.name, 100);
    const username = clean(data.username, 50);
    const password = clean(data.password, 100);
    const role = data.role === "admin" ? "admin" : "atendente";
    if (!name || !username || password.length < 6) return error("Preencha os campos e use senha com pelo menos 6 caracteres.");
    try {
      const result = await env.DB.prepare(
        "INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)",
      ).bind(name, username, await hashPassword(password), role).run();
      await audit(env, user, "user.create", "user", Number(result.meta.last_row_id), { name, username, role });
      return json({ id: result.meta.last_row_id }, 201);
    } catch {
      return error("Esse nome de usuário já está sendo usado.", 409);
    }
  }
  const userId = path.match(/^\/api\/users\/(\d+)$/);
  if (userId && request.method === "PATCH") {
    const data = await body(request);
    const id = Number(userId[1]);
    if (id === user.id && !data.active) return error("Você não pode desativar seu próprio usuário.");
    const name = titleCaseText(data.name, 100);
    const password = clean(data.password, 100);
    if (password) {
      if (password.length < 6) return error("A nova senha precisa ter pelo menos 6 caracteres.");
      await env.DB.prepare(
        "UPDATE users SET name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?",
      ).bind(name, data.role === "admin" ? "admin" : "atendente", data.active ? 1 : 0, await hashPassword(password), id).run();
    } else {
      await env.DB.prepare(
        "UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?",
      ).bind(name, data.role === "admin" ? "admin" : "atendente", data.active ? 1 : 0, id).run();
    }
    await audit(env, user, "user.update", "user", id, { name, role: data.role === "admin" ? "admin" : "atendente", active: !!data.active, passwordChanged: !!password });
    return json({ ok: true });
  }

  if (path === "/api/schedules" && request.method === "GET") return listSchedules(env, url);
  if (path === "/api/schedules" && request.method === "POST") {
    const data = await body(request);
    const kind = data.kind === "exame" ? "exame" : "profissional";
    const date = clean(data.schedule_date, 10);
    const period = clean(data.period, 10);
    const capacity = Math.max(1, Number(data.capacity) || 20);
    const professionalId = Number(data.professional_id);
    if (!["manha", "tarde", "noite"].includes(period)) return error("Selecione o turno da agenda.");
    if (!date || !professionalId) return error("Preencha o tipo, profissional e data da agenda.");
    const result = await env.DB.prepare(
      `INSERT INTO schedules
       (kind, professional_id, schedule_date, period, time_label, capacity, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(kind, professionalId, date, period, clean(data.time_label, 30), capacity, clean(data.notes, 300), user.id).run();
    await audit(env, user, "schedule.create", "schedule", Number(result.meta.last_row_id), { kind, professionalId, date, period, capacity });
    return json({ id: result.meta.last_row_id }, 201);
  }
  const scheduleId = path.match(/^\/api\/schedules\/(\d+)$/);
  if (scheduleId && request.method === "GET") return scheduleDetails(env, Number(scheduleId[1]));
  if (scheduleId && request.method === "DELETE") {
    const id = Number(scheduleId[1]);
    await env.DB.prepare("UPDATE schedules SET active = 0 WHERE id = ?").bind(id).run();
    await audit(env, user, "schedule.close", "schedule", id);
    return json({ ok: true });
  }
  if (scheduleId && request.method === "PATCH") {
    const data = await body(request);
    const id = Number(scheduleId[1]);
    if (
      data.kind !== undefined ||
      data.professional_id !== undefined ||
      data.schedule_date !== undefined ||
      data.period !== undefined ||
      data.time_label !== undefined ||
      data.capacity !== undefined ||
      data.notes !== undefined
    ) {
      const kind = data.kind === "exame" ? "exame" : "profissional";
      const date = clean(data.schedule_date, 10);
      const period = clean(data.period, 10);
      const capacity = Math.max(1, Number(data.capacity) || 20);
      const professionalId = Number(data.professional_id);
      if (!["manha", "tarde", "noite"].includes(period)) return error("Selecione o turno da agenda.");
      if (!date || !professionalId) return error("Preencha o tipo, profissional e data da agenda.");
      const occupied = await env.DB.prepare("SELECT COUNT(*) total FROM appointments WHERE schedule_id = ?").bind(id).first<{ total: number }>();
      if (capacity < Number(occupied?.total ?? 0)) return error("A quantidade de vagas não pode ser menor que a quantidade de pacientes já agendados.");
      await env.DB.prepare(
        `UPDATE schedules
         SET kind = ?, professional_id = ?, schedule_date = ?, period = ?, time_label = ?, capacity = ?, notes = ?
         WHERE id = ?`,
      ).bind(kind, professionalId, date, period, clean(data.time_label, 30), capacity, clean(data.notes, 300), id).run();
      await audit(env, user, "schedule.update", "schedule", id, { kind, professionalId, date, period, capacity });
      return json({ ok: true });
    }
    if (data.active) {
      const schedule = await env.DB.prepare("SELECT schedule_date FROM schedules WHERE id = ?").bind(id).first<{ schedule_date: string }>();
      if (schedule?.schedule_date && schedule.schedule_date < todaySaoPaulo()) return error("Agenda vencida não pode ser reativada. Altere a data da agenda primeiro.");
    }
    await env.DB.prepare("UPDATE schedules SET active = ? WHERE id = ?").bind(data.active ? 1 : 0, id).run();
    await audit(env, user, data.active ? "schedule.reopen" : "schedule.close", "schedule", id);
    return json({ ok: true });
  }

  if (path === "/api/patients/search" && request.method === "GET") {
    const q = clean(url.searchParams.get("q"), 100);
    if (!q) return json([]);
    const result = await env.DB.prepare(
      "SELECT id, record_number, name FROM patients WHERE record_number LIKE ? OR name LIKE ? ORDER BY name LIMIT 20",
    ).bind(`%${q}%`, `%${q}%`).all();
    return json(result.results);
  }

  if (path === "/api/appointments" && request.method === "POST") {
    const data = await body(request);
    const scheduleId = Number(data.schedule_id);
    const slotNumber = Number(data.slot_number);
    const record = clean(data.record_number, 50);
    const patientName = titleCaseText(data.patient_name, 150);
    if (!scheduleId || !slotNumber || !record || !patientName) return error("Informe vaga, prontuário e nome do paciente.");
    const schedule = await env.DB.prepare(
      `SELECT s.kind, s.capacity, COUNT(a.id) occupied FROM schedules s
       LEFT JOIN appointments a ON a.schedule_id = s.id
       WHERE s.id = ? AND s.active = 1 AND s.schedule_date >= ?
       GROUP BY s.id`,
    ).bind(scheduleId, todaySaoPaulo()).first<{ kind: string; capacity: number; occupied: number }>();
    if (!schedule) return error("Agenda não encontrada.", 404);
    if (slotNumber < 1 || slotNumber > Number(schedule.capacity)) return error("Número da vaga inválido para esta agenda.");
    if (Number(schedule.occupied) >= Number(schedule.capacity)) return error("Esta agenda já está lotada.", 409);
    await env.DB.prepare(
      `INSERT INTO patients (record_number, name) VALUES (?, ?)
       ON CONFLICT(record_number) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP`,
    ).bind(record, patientName).run();
    const patient = await env.DB.prepare("SELECT id FROM patients WHERE record_number = ?").bind(record).first<{ id: number }>();
    try {
      const result = await env.DB.prepare(
        "INSERT INTO appointments (schedule_id, slot_number, patient_id, observation, created_by) VALUES (?, ?, ?, ?, ?)",
      ).bind(scheduleId, slotNumber, patient!.id, clean(data.observation, 500), user.id).run();
      await audit(env, user, "appointment.create", "appointment", Number(result.meta.last_row_id), { scheduleId, slotNumber, record, patientName });
      return json({ id: result.meta.last_row_id }, 201);
    } catch {
      return error("Este prontuário já está nessa agenda ou esta vaga já está ocupada.", 409);
    }
  }
  const appointmentId = path.match(/^\/api\/appointments\/(\d+)$/);
  if (appointmentId && request.method === "PATCH") {
    const data = await body(request);
    const record = clean(data.record_number, 50);
    const patientName = titleCaseText(data.patient_name, 150);
    if (!record || !patientName) return error("Informe prontuário e nome.");
    const appointment = await env.DB.prepare(
      `SELECT a.patient_id, s.kind, s.active, s.schedule_date
       FROM appointments a
       JOIN schedules s ON s.id = a.schedule_id
       WHERE a.id = ?`,
    ).bind(Number(appointmentId[1])).first<{ patient_id: number; kind: string; active: number; schedule_date: string }>();
    if (!appointment) return error("Agendamento não encontrado.", 404);
    if (Number(appointment.active) !== 1 || appointment.schedule_date < todaySaoPaulo()) return error("Esta agenda está encerrada.");
    try {
      const statements = [
        env.DB.prepare("UPDATE patients SET record_number = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(record, patientName, appointment.patient_id),
        env.DB.prepare("UPDATE appointments SET observation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(clean(data.observation, 500), Number(appointmentId[1])),
      ];
      await env.DB.batch(statements);
      await audit(env, user, "appointment.update", "appointment", Number(appointmentId[1]), { record, patientName });
      return json({ ok: true });
    } catch {
      return error("Já existe outro paciente com esse prontuário.", 409);
    }
  }
  if (appointmentId && request.method === "DELETE") {
    const appointment = await env.DB.prepare(
      `SELECT s.active, s.schedule_date
       FROM appointments a
       JOIN schedules s ON s.id = a.schedule_id
       WHERE a.id = ?`,
    ).bind(Number(appointmentId[1])).first<{ active: number; schedule_date: string }>();
    if (!appointment) return error("Agendamento não encontrado.", 404);
    if (Number(appointment.active) !== 1 || appointment.schedule_date < todaySaoPaulo()) return error("Esta agenda está encerrada.");
    const id = Number(appointmentId[1]);
    await env.DB.prepare("DELETE FROM appointments WHERE id = ?").bind(id).run();
    await audit(env, user, "appointment.delete", "appointment", id);
    return json({ ok: true });
  }

  return error("Página não encontrada.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const printMatch = url.pathname.match(/^\/print\/schedule\/(\d+)$/);
      const response = printMatch
        ? await printSchedulePage(request, env, Number(printMatch[1]))
        : url.pathname.startsWith("/api/")
          ? await api(request, env)
          : await env.ASSETS.fetch(request);
      const secured = new Response(response.body, response);
      secured.headers.set("X-Content-Type-Options", "nosniff");
      secured.headers.set("X-Frame-Options", "DENY");
      secured.headers.set("Referrer-Policy", "same-origin");
      secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      return secured;
    } catch (cause) {
      console.error(cause);
      return error("Ocorreu um erro inesperado. Tente novamente.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
