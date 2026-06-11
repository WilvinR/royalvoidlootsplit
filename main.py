import discord
from discord.ext import commands
import asyncio
import os
import json
import sqlite3
import time
import secrets
import datetime

import urllib.parse
from pathlib import Path
import aiohttp
from aiohttp import web

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

# Define your intents
intents = discord.Intents.default()
intents.message_content = False
intents.reactions = True
intents.members = True

# Initialize bot
bot = commands.Bot(command_prefix="!", intents=intents)

_SESSIONS: dict[str, dict] = {}
_SESSION_COOKIE_NAME = "lootsplit_session"

_OAUTH_STATES: dict[str, float] = {}

def _configured_guild_id() -> int | None:
    raw = os.getenv("GUILD_ID", "").strip()
    if not raw:
        return None
    if not raw.isdigit():
        return None
    return int(raw)

def _session_has_guild(sess: dict, guild_id: int) -> bool:
    try:
        guilds = sess.get("guilds", [])
        return any(str(g.get("id")) == str(guild_id) for g in guilds if isinstance(g, dict))
    except Exception:
        return False

def _session_can_manage_guild(sess: dict, guild_id: int) -> bool:
    try:
        guilds = sess.get("guilds", [])
        for g in guilds if isinstance(guilds, list) else []:
            if not isinstance(g, dict):
                continue
            if str(g.get("id")) != str(guild_id):
                continue
            if g.get("owner") is True:
                return True
            perms_raw = g.get("permissions")
            try:
                perms_int = int(perms_raw)
            except Exception:
                perms_int = 0
            if perms_int & 0x8:
                return True
            if perms_int & 0x20:
                return True
            return False
        return False
    except Exception:
        return False

def _session_is_guild_owner(sess: dict, guild_id: int) -> bool:
    try:
        guilds = sess.get("guilds", [])
        for g in guilds if isinstance(guilds, list) else []:
            if not isinstance(g, dict):
                continue
            if str(g.get("id")) != str(guild_id):
                continue
            return g.get("owner") is True
        return False
    except Exception:
        return False

async def _is_guild_owner(sess: dict, guild_id: int) -> bool:
    if _session_is_guild_owner(sess, guild_id):
        return True
    try:
        user_id = int(str(((sess.get("user") or {}).get("id")) or 0) or 0)
    except Exception:
        user_id = 0
    if user_id <= 0:
        return False
    guild = bot.get_guild(int(guild_id))
    if guild is None:
        return False
    try:
        return int(getattr(guild, "owner_id", 0) or 0) == user_id
    except Exception:
        return False

def _role_names_allowed() -> set[str]:
    raw = os.getenv("MOD_ROLE_NAMES", "moderator,moderador,mod").strip()
    out: set[str] = set()
    for part in raw.split(","):
        name = part.strip().lower()
        if name:
            out.add(name)
    return out

def _role_ids_allowed() -> set[int]:
    raw = os.getenv("MOD_ROLE_IDS", "").strip()
    out: set[int] = set()
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            out.add(int(p))
        except Exception:
            continue
    return out

def _member_can_manage(guild: discord.Guild, member: discord.Member) -> bool:
    try:
        perms = getattr(member, "guild_permissions", None)
        if perms and (getattr(perms, "administrator", False) or getattr(perms, "manage_guild", False)):
            return True

        if perms and (
            getattr(perms, "manage_messages", False)
            or getattr(perms, "kick_members", False)
            or getattr(perms, "ban_members", False)
            or getattr(perms, "moderate_members", False)
            or getattr(perms, "manage_channels", False)
        ):
            return True

        allowed_names = _role_names_allowed()
        allowed_ids = _role_ids_allowed()
        for r in list(getattr(member, "roles", []) or []):
            rid = getattr(r, "id", None)
            rname = str(getattr(r, "name", "")).strip().lower()
            if rid is not None and int(rid) in allowed_ids:
                return True
            if rname and rname in allowed_names:
                return True
        return False
    except Exception:
        return False

# ── HELPER FUNCTION: GET DISPLAY NAME ────────────────────────────────────
async def get_display_name(guild: discord.Guild, user_id: int) -> str:
    """
    Obtiene el nombre a mostrar para un usuario.
    Orden de prioridad:
    1. Apodo personalizado en el servidor (member.nick)
    2. Nombre global de Discord (user.global_name)
    3. Username de Discord (user.username)
    4. ID del usuario como fallback
    
    ✅ FIX NICKNAMES: Esta función prioriza el apodo del servidor
    """
    try:
        # Intentar obtener el miembro del servidor
        member = guild.get_member(user_id)
        
        if member and member.nick:
            # Si tiene apodo en el servidor, usarlo ✅
            return member.nick
        
        # Si no tiene apodo, obtener el usuario global
        user = await bot.fetch_user(user_id)
        return user.global_name or user.username or str(user_id)
    
    except Exception:
        # Fallback: retornar el ID
        return str(user_id)

# ── ZVZ DISCORD INTEGRATION ───────────────────────────────────────
async def zvz_create_discord_role(guild: discord.Guild, role_name: str, role_color: str) -> dict:
    """
    Crea un rol en Discord con nombre y color específicos.
    Retorna {'success': bool, 'role_id': int|None, 'error': str}
    """
    try:
        print(f"[ZVZ CREATE ROLE] Iniciando...")
        print(f"[ZVZ CREATE ROLE] Guild: {guild.name} (ID: {guild.id})")
        print(f"[ZVZ CREATE ROLE] Role name: {role_name}")
        print(f"[ZVZ CREATE ROLE] Color: {role_color}")

        color_hex = role_color.lstrip('#')
        print(f"[ZVZ CREATE ROLE] Color hex limpio: {color_hex}")

        if len(color_hex) != 6 or not all(c in '0123456789abcdefABCDEF' for c in color_hex):
            print(f"[ZVZ CREATE ROLE] ❌ Color inválido")
            return {'success': False, 'error': 'Color inválido'}

        color_int = int(color_hex, 16)
        color_obj = discord.Color(color_int)
        print(f"[ZVZ CREATE ROLE] Color objeto creado: {color_obj}")

        print(f"[ZVZ CREATE ROLE] Verificando si el rol ya existe...")
        for r in guild.roles:
            if r.name.lower() == role_name.lower():
                print(f"[ZVZ CREATE ROLE] ❌ Rol ya existe: {r.name}")
                return {'success': False, 'error': f'El rol "{role_name}" ya existe en Discord'}

        print(f"[ZVZ CREATE ROLE] Rol no existe, creando...")
        new_role = await guild.create_role(
            name=role_name,
            color=color_obj,
            permissions=discord.Permissions.none(),
            reason="ZvZ Composition Role"
        )
        print(f"[ZVZ CREATE ROLE] ✅ Rol creado exitosamente")
        print(f"[ZVZ CREATE ROLE] Role ID: {new_role.id}")

        return {'success': True, 'role_id': new_role.id, 'error': None}
    except Exception as e:
        print(f"[ZVZ CREATE ROLE] ❌ EXCEPCIÓN: {str(e)}")
        print(f"[ZVZ CREATE ROLE] Tipo: {type(e).__name__}")
        return {'success': False, 'error': str(e)}

async def zvz_delete_discord_role(guild: discord.Guild, role_name: str) -> dict:
    """
    Elimina un rol en Discord por nombre.
    Retorna {'success': bool, 'error': str}
    """
    try:
        print(f"[ZVZ DELETE ROLE] Iniciando...")
        print(f"[ZVZ DELETE ROLE] Guild: {guild.name}")
        print(f"[ZVZ DELETE ROLE] Role name: {role_name}")

        print(f"[ZVZ DELETE ROLE] Buscando rol...")
        role = discord.utils.find(lambda r: r.name.lower() == role_name.lower(), guild.roles)
        if not role:
            print(f"[ZVZ DELETE ROLE] ❌ Rol no encontrado")
            return {'success': False, 'error': f'Rol "{role_name}" no encontrado en Discord'}

        print(f"[ZVZ DELETE ROLE] ✅ Rol encontrado: {role.name}")
        print(f"[ZVZ DELETE ROLE] Eliminando rol...")

        await role.delete(reason="ZvZ Composition Role Deleted")

        print(f"[ZVZ DELETE ROLE] ✅ Rol eliminado exitosamente")
        return {'success': True, 'error': None}
    except Exception as e:
        print(f"[ZVZ DELETE ROLE] ❌ EXCEPCIÓN: {str(e)}")
        print(f"[ZVZ DELETE ROLE] Tipo: {type(e).__name__}")
        return {'success': False, 'error': str(e)}

async def zvz_assign_role_to_member(guild: discord.Guild, member_name: str, role_name: str, member_id: str = "") -> dict:
    """
    Asigna un rol a un miembro en Discord.
    Prioriza búsqueda por member_id (Discord ID), con fallback a nombre/nickname.
    Retorna {'success': bool, 'error': str}
    """
    try:
        print(f"[ZVZ ASSIGN MEMBER] Iniciando...")
        print(f"[ZVZ ASSIGN MEMBER] Guild: {guild.name}")
        print(f"[ZVZ ASSIGN MEMBER] Member: {member_name} | ID: {member_id or 'no enviado'}")
        print(f"[ZVZ ASSIGN MEMBER] Role: {role_name}")

        print(f"[ZVZ ASSIGN MEMBER] Buscando miembro...")
        member = None

        if member_id and str(member_id).isdigit():
            member = guild.get_member(int(member_id))
            if member:
                print(f"[ZVZ ASSIGN MEMBER] ✅ Miembro encontrado por ID: {member.name}")

        if not member:
            name_clean = member_name.lower().strip()
            member = discord.utils.find(
                lambda m: (
                    m.name.lower() == name_clean or
                    m.display_name.lower() == name_clean or
                    (m.nick and m.nick.lower() == name_clean)
                ),
                guild.members
            )
            if member:
                print(f"[ZVZ ASSIGN MEMBER] ✅ Miembro encontrado por nombre: {member.name}")

        if not member:
            print(f"[ZVZ ASSIGN MEMBER] ❌ Miembro no encontrado")
            return {'success': False, 'error': f'Miembro "{member_name}" no encontrado'}

        print(f"[ZVZ ASSIGN MEMBER] ✅ Miembro confirmado: {member.name}")

        print(f"[ZVZ ASSIGN MEMBER] Buscando rol...")
        role = discord.utils.find(lambda r: r.name.lower() == role_name.lower(), guild.roles)
        if not role:
            print(f"[ZVZ ASSIGN MEMBER] ❌ Rol no encontrado")
            return {'success': False, 'error': f'Rol "{role_name}" no encontrado en Discord'}

        print(f"[ZVZ ASSIGN MEMBER] ✅ Rol encontrado: {role.name}")

        print(f"[ZVZ ASSIGN MEMBER] Asignando rol...")
        if role not in member.roles:
            await member.add_roles(role, reason="ZvZ Composition Assignment")
            print(f"[ZVZ ASSIGN MEMBER] ✅ Rol asignado exitosamente")
        else:
            print(f"[ZVZ ASSIGN MEMBER] ℹ️  Miembro ya tiene este rol")

        return {'success': True, 'error': None}
    except Exception as e:
        print(f"[ZVZ ASSIGN MEMBER] ❌ EXCEPCIÓN: {str(e)}")
        print(f"[ZVZ ASSIGN MEMBER] Tipo: {type(e).__name__}")
        return {'success': False, 'error': str(e)}

async def zvz_remove_role_from_member(guild: discord.Guild, member_name: str, role_name: str, member_id: str = "") -> dict:
    """
    Quita un rol a un miembro en Discord.
    Prioriza búsqueda por member_id (Discord ID), con fallback a nombre/nickname.
    Retorna {'success': bool, 'error': str}
    """
    try:
        print(f"[ZVZ REMOVE MEMBER] Iniciando...")
        print(f"[ZVZ REMOVE MEMBER] Guild: {guild.name}")
        print(f"[ZVZ REMOVE MEMBER] Member: {member_name} | ID: {member_id or 'no enviado'}")
        print(f"[ZVZ REMOVE MEMBER] Role: {role_name}")

        print(f"[ZVZ REMOVE MEMBER] Buscando miembro...")
        member = None

        if member_id and str(member_id).isdigit():
            member = guild.get_member(int(member_id))
            if member:
                print(f"[ZVZ REMOVE MEMBER] ✅ Miembro encontrado por ID: {member.name}")

        if not member:
            name_clean = member_name.lower().strip()
            member = discord.utils.find(
                lambda m: (
                    m.name.lower() == name_clean or
                    m.display_name.lower() == name_clean or
                    (m.nick and m.nick.lower() == name_clean)
                ),
                guild.members
            )
            if member:
                print(f"[ZVZ REMOVE MEMBER] ✅ Miembro encontrado por nombre: {member.name}")

        # FIX 1: Si el miembro ya no está en el servidor, se considera removido — éxito silencioso
        if not member:
            print(f"[ZVZ REMOVE MEMBER] ℹ️  Miembro no encontrado (ya salió del servidor) — se considera removido")
            return {'success': True, 'error': None}

        print(f"[ZVZ REMOVE MEMBER] ✅ Miembro confirmado: {member.name}")

        print(f"[ZVZ REMOVE MEMBER] Buscando rol...")
        role = discord.utils.find(lambda r: r.name.lower() == role_name.lower(), guild.roles)
        if not role:
            print(f"[ZVZ REMOVE MEMBER] ❌ Rol no encontrado")
            return {'success': False, 'error': f'Rol "{role_name}" no encontrado en Discord'}

        print(f"[ZVZ REMOVE MEMBER] ✅ Rol encontrado: {role.name}")

        print(f"[ZVZ REMOVE MEMBER] Quitando rol...")
        if role in member.roles:
            await member.remove_roles(role, reason="ZvZ Composition Removal")
            print(f"[ZVZ REMOVE MEMBER] ✅ Rol quitado exitosamente")
        else:
            print(f"[ZVZ REMOVE MEMBER] ℹ️  Miembro no tiene este rol")

        return {'success': True, 'error': None}
    except Exception as e:
        print(f"[ZVZ REMOVE MEMBER] ❌ EXCEPCIÓN: {str(e)}")
        print(f"[ZVZ REMOVE MEMBER] Tipo: {type(e).__name__}")
        return {'success': False, 'error': str(e)}

async def _can_manage_guild(sess: dict, guild_id: int) -> bool:
    if _session_can_manage_guild(sess, guild_id):
        return True

    try:
        user_id = int(str(((sess.get("user") or {}).get("id")) or 0) or 0)
    except Exception:
        user_id = 0
    if user_id <= 0:
        return False

    guild = bot.get_guild(int(guild_id))
    if guild is None:
        return False

    member = guild.get_member(user_id)
    if member is None:
        try:
            member = await guild.fetch_member(user_id)
        except Exception:
            member = None
    if member is None:
        return False
    return _member_can_manage(guild, member)

def _base_url(request: web.Request) -> str:
    forwarded_proto = request.headers.get("X-Forwarded-Proto")
    forwarded_host = request.headers.get("X-Forwarded-Host")
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"
    return str(request.url.origin())

def _oauth_redirect_url(request: web.Request) -> str:
    configured = os.getenv("DISCORD_OAUTH_REDIRECT_URL", "").strip()
    if configured:
        return configured
    return f"{_base_url(request)}/oauth/callback"

def _is_https(request: web.Request) -> bool:
    forwarded_proto = request.headers.get("X-Forwarded-Proto")
    if forwarded_proto:
        return forwarded_proto.lower() == "https"
    return request.url.scheme.lower() == "https"

def _cookie_samesite(request: web.Request) -> str:
    if _is_https(request):
        return "None"
    return "Lax"

def _discord_oauth_config_ok() -> bool:
    return bool(os.getenv("DISCORD_CLIENT_ID", "").strip() and os.getenv("DISCORD_CLIENT_SECRET", "").strip())

def _discord_authorize_url(request: web.Request, state: str) -> str:
    client_id = os.getenv("DISCORD_CLIENT_ID", "").strip()
    redirect_uri = _oauth_redirect_url(request)
    prompt = os.getenv("DISCORD_OAUTH_PROMPT", "consent").strip() or "consent"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "identify guilds",
        "state": state,
        "prompt": prompt,
    }
    return "https://discord.com/api/oauth2/authorize?" + urllib.parse.urlencode(params)

def _get_session(request: web.Request) -> dict | None:
    sid = request.cookies.get(_SESSION_COOKIE_NAME)
    if not sid:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            sid = auth[len("Bearer ") :].strip()
    if not sid:
        return None
    sess = _SESSIONS.get(sid)
    if not sess:
        return None
    if sess.get("expires_at", 0) < time.time():
        _SESSIONS.pop(sid, None)
        return None
    return sess

def _require_session(request: web.Request) -> dict | None:
    return _get_session(request)

def _db_connect():
    conn = sqlite3.connect("loot.db")
    conn.row_factory = sqlite3.Row
    return conn

def _db_init():
    conn = _db_connect()
    try:
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS user_balance (
                guild_id INTEGER,
                user_id INTEGER,
                balance INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER,
                user_id INTEGER,
                amount INTEGER,
                admin_id INTEGER,
                paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transaction_type TEXT DEFAULT 'payment'
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                total_amount INTEGER NOT NULL,
                per_person_amount INTEGER NOT NULL,
                island TEXT,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER NOT NULL,
                channel_id INTEGER NOT NULL,
                date TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                FOREIGN KEY(activity_id) REFERENCES activities(id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_finance (
                guild_id INTEGER PRIMARY KEY,
                balance INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                kind TEXT NOT NULL,
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS zvz_state (
                guild_id INTEGER PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_points (
                guild_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name TEXT NOT NULL DEFAULT '',
                points INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_codes (
                guild_id INTEGER NOT NULL,
                code TEXT NOT NULL,
                uses_remaining INTEGER NOT NULL,
                uses_total INTEGER NOT NULL,
                points_per_use INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                created_by INTEGER NOT NULL,
                PRIMARY KEY (guild_id, code)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_code_uses (
                guild_id INTEGER NOT NULL,
                code TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                PRIMARY KEY (guild_id, code, user_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_debts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                paid INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER NOT NULL DEFAULT 0,
                paid_at TIMESTAMP,
                paid_by INTEGER
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_guild_debts_guild ON guild_debts(guild_id)"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS member_roles (
                guild_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                primary_role TEXT NOT NULL DEFAULT '',
                secondary_role TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS member_attendance (
                guild_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                week TEXT NOT NULL,
                day TEXT NOT NULL,
                mark TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id, week, day)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _table_columns(cur, table: str) -> set[str]:
    cur.execute(f"PRAGMA table_info({table})")
    return {str(row[1]) for row in cur.fetchall()}


def _db_migrate_member_roster() -> None:
    """Recrea tablas de roster si quedaron con esquema antiguo (p. ej. sin columna day)."""
    conn = _db_connect()
    try:
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='member_attendance'")
        if cur.fetchone():
            required = {"guild_id", "user_id", "week", "day", "mark"}
            cols = _table_columns(cur, "member_attendance")
            if not required.issubset(cols):
                print(f"[DB MIGRATE] member_attendance esquema antiguo ({sorted(cols)}), recreando…")
                cur.execute("DROP TABLE member_attendance")
                cur.execute(
                    """
                    CREATE TABLE member_attendance (
                        guild_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        week TEXT NOT NULL,
                        day TEXT NOT NULL,
                        mark TEXT NOT NULL DEFAULT '',
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (guild_id, user_id, week, day)
                    )
                    """
                )

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='member_roles'")
        if cur.fetchone():
            required = {"guild_id", "user_id", "primary_role", "secondary_role"}
            cols = _table_columns(cur, "member_roles")
            if not required.issubset(cols):
                print(f"[DB MIGRATE] member_roles esquema antiguo ({sorted(cols)}), recreando…")
                cur.execute("DROP TABLE member_roles")
                cur.execute(
                    """
                    CREATE TABLE member_roles (
                        guild_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        primary_role TEXT NOT NULL DEFAULT '',
                        secondary_role TEXT NOT NULL DEFAULT '',
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (guild_id, user_id)
                    )
                    """
                )

        conn.commit()
    finally:
        conn.close()


def _db_fix_negative_balances():
    """Corrige balances negativos existentes — los pone a 0."""
    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE user_balance SET balance = 0 WHERE balance < 0")
        fixed = cur.rowcount
        if fixed > 0:
            print(f"[DB FIX] Se corrigieron {fixed} balances negativos a 0")
        conn.commit()
    finally:
        conn.close()


# FIX 2: Eliminar filas con balance = 0 al arrancar el bot
def _db_cleanup_zero_balances():
    """Elimina filas con balance = 0 — no tiene sentido mostrarlas."""
    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM user_balance WHERE balance = 0")
        removed = cur.rowcount
        if removed > 0:
            print(f"[DB CLEANUP] Se eliminaron {removed} filas con balance = 0")
        conn.commit()
    finally:
        conn.close()


def _debt_status_color(total_debt: int, guild_balance: int) -> tuple[str, float]:
    try:
        yellow_pct = float(os.getenv("OWNER_DEBT_YELLOW_PCT", "90").strip() or "90")
    except Exception:
        yellow_pct = 90.0
    if yellow_pct <= 0:
        yellow_pct = 90.0

    if guild_balance <= 0:
        if total_debt <= 0:
            return "green", 0.0
        return "red", 100.0

    ratio = (float(total_debt) / float(guild_balance)) * 100.0
    if ratio >= 100.0:
        return "red", ratio
    if ratio >= yellow_pct:
        return "yellow", ratio
    return "green", ratio

def _auth_ok(request: web.Request) -> bool:
    expected = os.getenv("LOOTSPLIT_API_TOKEN", "").strip()
    if not expected:
        return True
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return False
    provided = auth[len("Bearer ") :].strip()
    return provided == expected

async def _json_error(status: int, message: str):
    return web.json_response({"success": False, "error": message}, status=status)

def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }

def _allowed_origins() -> set[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return set()
    return {o.strip().rstrip("/") for o in raw.split(",") if o.strip()}

def _cors_origin_for(request: web.Request) -> str:
    origin = request.headers.get("Origin")
    if not origin:
        return "*"
    origin = origin.rstrip("/")
    allowed = _allowed_origins()
    if not allowed:
        return origin
    return origin if origin in allowed else "null"

@web.middleware
async def _cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        hdrs = _cors_headers()
        hdrs["Access-Control-Allow-Origin"] = _cors_origin_for(request)
        return web.Response(status=204, headers=hdrs)
    try:
        resp = await handler(request)
    except web.HTTPException as exc:
        resp = exc
    hdrs = _cors_headers()
    hdrs["Access-Control-Allow-Origin"] = _cors_origin_for(request)
    for k, v in hdrs.items():
        resp.headers[k] = v
    return resp

async def index_handler(request: web.Request) -> web.StreamResponse:
    base = Path(__file__).resolve().parent
    index_path = base / "pagina lootsplit" / "index.html"
    if not index_path.exists():
        return web.Response(status=404, text="index.html not found")
    return web.FileResponse(path=index_path)

async def static_file_handler(request: web.Request) -> web.StreamResponse:
    filename = request.match_info.get("filename", "")
    if filename not in {"styles.css", "script.js"}:
        return web.Response(status=404, text="Not found")
    base = Path(__file__).resolve().parent
    path = base / "pagina lootsplit" / filename
    if not path.exists():
        return web.Response(status=404, text="Not found")
    return web.FileResponse(path=path)

async def login_handler(request: web.Request) -> web.StreamResponse:
    if not _discord_oauth_config_ok():
        return await _json_error(500, "Missing DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET")
    state = secrets.token_urlsafe(24)
    _OAUTH_STATES[state] = time.time() + 600
    redirect = _discord_authorize_url(request, state)
    resp = web.HTTPFound(location=redirect)
    secure = _is_https(request)
    samesite = _cookie_samesite(request)
    resp.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=600,
        path="/",
    )
    return resp

async def oauth_callback_handler(request: web.Request) -> web.StreamResponse:
    if not _discord_oauth_config_ok():
        return await _json_error(500, "Missing DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET")

    code = request.query.get("code", "").strip()
    state = request.query.get("state", "").strip()
    expected_state = request.cookies.get("oauth_state", "")

    valid = False
    if expected_state and state == expected_state:
        valid = True
    else:
        expires_at = _OAUTH_STATES.get(state, 0)
        if expires_at and expires_at >= time.time():
            valid = True

    _OAUTH_STATES.pop(state, None)
    if not valid:
        return await _json_error(400, "Invalid OAuth state")

    client_id = os.getenv("DISCORD_CLIENT_ID", "").strip()
    client_secret = os.getenv("DISCORD_CLIENT_SECRET", "").strip()
    redirect_uri = _oauth_redirect_url(request)

    token_url = "https://discord.com/api/oauth2/token"
    async with aiohttp.ClientSession() as session:
        async with session.post(
            token_url,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ) as r:
            if r.status != 200:
                text = await r.text()
                return await _json_error(400, f"Token exchange failed: {text}")
            token_data = await r.json()

        access_token = token_data.get("access_token")
        if not access_token:
            return await _json_error(400, "No access_token")

        async with session.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as r:
            if r.status != 200:
                text = await r.text()
                return await _json_error(400, f"Failed to fetch user: {text}")
            user = await r.json()

        async with session.get(
            "https://discord.com/api/users/@me/guilds",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as r:
            if r.status != 200:
                text = await r.text()
                return await _json_error(400, f"Failed to fetch guilds: {text}")
            guilds = await r.json()

    sid = secrets.token_urlsafe(32)
    _SESSIONS[sid] = {
        "created_at": time.time(),
        "expires_at": time.time() + 60 * 60 * 12,
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "global_name": user.get("global_name"),
            "avatar": user.get("avatar"),
        },
        "guilds": guilds,
    }

    web_root = os.getenv("WEB_ROOT_URL", "http://localhost:5500/")
    web_root_pass_sid = os.getenv("WEB_ROOT_PASS_SID", "1").strip() != "0"
    if web_root_pass_sid:
        parsed = urllib.parse.urlparse(web_root)
        q = urllib.parse.parse_qs(parsed.query)
        q["sid"] = [sid]
        new_query = urllib.parse.urlencode(q, doseq=True)
        web_root = urllib.parse.urlunparse(parsed._replace(query=new_query))
    resp = web.HTTPFound(location=web_root)
    resp.del_cookie("oauth_state", path="/")
    secure = _is_https(request)
    samesite = _cookie_samesite(request)
    resp.set_cookie(
        _SESSION_COOKIE_NAME,
        sid,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=60 * 60 * 12,
        path="/",
    )
    return resp

async def logout_handler(request: web.Request) -> web.StreamResponse:
    sid = request.cookies.get(_SESSION_COOKIE_NAME)
    if sid:
        _SESSIONS.pop(sid, None)

    web_root = os.getenv("WEB_ROOT_URL", "/").strip() or "/"
    try:
        parsed = urllib.parse.urlparse(web_root)
        q = urllib.parse.parse_qs(parsed.query)
        q.pop("sid", None)
        new_query = urllib.parse.urlencode(q, doseq=True)
        web_root = urllib.parse.urlunparse(parsed._replace(query=new_query))
    except Exception:
        pass

    resp = web.HTTPFound(location=web_root)
    resp.del_cookie(_SESSION_COOKIE_NAME, path="/")
    return resp

async def api_me_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    return web.json_response({"success": True, "user": sess.get("user")})

async def api_guilds_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guilds = sess.get("guilds", [])
    configured = _configured_guild_id()
    if configured is None:
        return web.json_response({"success": True, "guilds": guilds})

    if not _session_has_guild(sess, configured):
        try:
            sample = []
            for g in guilds[:15] if isinstance(guilds, list) else []:
                if isinstance(g, dict):
                    gid = g.get("id")
                    name = g.get("name")
                    if gid:
                        sample.append(f"{gid}:{name}" if name else str(gid))
            extra = " | available=" + ",".join(sample) if sample else ""
        except Exception:
            extra = ""
        return await _json_error(403, f"Configured GUILD_ID not found in your Discord guild list{extra}")

    filtered = [g for g in guilds if isinstance(g, dict) and str(g.get("id")) == str(configured)]
    return web.json_response({"success": True, "guilds": filtered})

async def api_balance_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    user_id = str((sess.get("user") or {}).get("id") or "").strip()
    if not guild_id.isdigit() or not user_id.isdigit():
        return await _json_error(400, "Invalid guild_id or user")
    if not _session_has_guild(sess, int(guild_id)):
        return await _json_error(403, "Guild not allowed")
    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT balance FROM user_balance WHERE guild_id = ? AND user_id = ?",
            (int(guild_id), int(user_id)),
        )
        row = cur.fetchone()
        balance = int(row[0]) if row else 0
        return web.json_response(
            {
                "success": True,
                "guild_id": int(guild_id),
                "user_id": int(user_id),
                "balance": balance,
            }
        )
    finally:
        conn.close()

async def api_history_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    user_id = str((sess.get("user") or {}).get("id") or "").strip()
    limit = request.query.get("limit", "50").strip()
    if not guild_id.isdigit() or not user_id.isdigit() or (limit and not limit.isdigit()):
        return await _json_error(400, "Invalid params")
    if not _session_has_guild(sess, int(guild_id)):
        return await _json_error(403, "Guild not allowed")
    lim = max(1, min(200, int(limit)))

    guild = bot.get_guild(int(guild_id))
    _name_cache: dict[int, str] = {}

    async def resolve_name(uid: int) -> str:
        if uid == 0:
            return "Sistema"
        if uid in _name_cache:
            return _name_cache[uid]
        name = str(uid)
        try:
            if guild is not None:
                member = guild.get_member(uid)
                if member is None:
                    member = await guild.fetch_member(uid)
                if member is not None:
                    name = member.display_name
        except Exception:
            pass
        if name == str(uid):
            try:
                user = await bot.fetch_user(uid)
                name = user.name or str(uid)
            except Exception:
                pass
        _name_cache[uid] = name
        return name

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, amount, admin_id, paid_at, transaction_type
            FROM payment_history
            WHERE guild_id = ? AND user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(guild_id), int(user_id), lim),
        )
        rows = cur.fetchall()
        history = []
        for r in rows:
            item = dict(r)
            admin_id = int(item.get("admin_id") or 0)
            item["admin_name"] = await resolve_name(admin_id)
            history.append(item)
        return web.json_response(
            {
                "success": True,
                "guild_id": int(guild_id),
                "user_id": int(user_id),
                "history": history,
            }
        )
    finally:
        conn.close()

async def api_leaderboard_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    limit = request.query.get("limit", "10").strip()
    if not guild_id.isdigit() or (limit and not limit.isdigit()):
        return await _json_error(400, "Invalid params")
    if not _session_has_guild(sess, int(guild_id)):
        return await _json_error(403, "Guild not allowed")
    lim = max(1, min(50, int(limit)))
    guild = bot.get_guild(int(guild_id))
    _name_cache: dict[int, str] = {}

    async def resolve_name(uid: int) -> str:
        if uid in _name_cache:
            return _name_cache[uid]
        name = str(uid)
        try:
            if guild is not None:
                member = guild.get_member(uid)
                if member is None:
                    member = await guild.fetch_member(uid)
                if member is not None:
                    name = member.display_name
        except Exception:
            pass
        if name == str(uid):
            try:
                user = await bot.fetch_user(uid)
                name = user.name or str(uid)
            except Exception:
                pass
        _name_cache[uid] = name
        return name

    conn = _db_connect()
    try:
        cur = conn.cursor()
        # FIX 2: Solo mostrar usuarios con balance > 0
        cur.execute(
            "SELECT user_id, balance FROM user_balance WHERE guild_id = ? AND balance > 0 ORDER BY balance DESC LIMIT ?",
            (int(guild_id), lim),
        )
        rows = cur.fetchall()
        leaderboard = []
        for r in rows:
            uid = int(r[0])
            bal = int(r[1])
            leaderboard.append({"user_id": str(uid), "user_name": await resolve_name(uid), "balance": bal})
        return web.json_response({"success": True, "guild_id": int(guild_id), "leaderboard": leaderboard})
    finally:
        conn.close()

async def api_members_handler(request: web.Request) -> web.StreamResponse:

    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    filt = request.query.get("filter", "role").strip().lower() or "role"
    voice_channel_id = request.query.get("voice_channel_id", "").strip()
    if voice_channel_id and not voice_channel_id.isdigit():
        return await _json_error(400, "Invalid voice_channel_id")
    if not guild_id.isdigit() or filt not in {"role", "voice"}:
        return await _json_error(400, "Invalid params")
    gid = int(guild_id)

    # Solo requiere estar logueado — no necesita ser mod
    guild = bot.get_guild(gid)
    if guild is None:
        return await _json_error(404, "Guild not found")
    sess_user_id = int((sess.get("user") or {}).get("id") or 0)
    if sess_user_id and guild.get_member(sess_user_id) is None:
        return await _json_error(403, "Not a member of this guild")

    members_out = []
    channels_out = []
    try:
        everyone_id = guild.id
        voice_channel_filter = int(voice_channel_id) if voice_channel_id else None
        if filt == "voice":
            try:
                voice_channels = list(getattr(guild, "voice_channels", []) or [])
            except Exception:
                voice_channels = []
            channels_out = [
                {
                    "id": str(getattr(ch, "id", "")),
                    "name": str(getattr(ch, "name", "")),
                }
                for ch in voice_channels
                if getattr(ch, "id", None) is not None
            ]
        for m in guild.members:
            if m is None or m.bot:
                continue
            if filt == "voice":
                if not (m.voice and m.voice.channel is not None):
                    continue
                ch = m.voice.channel
                ch_id = getattr(ch, "id", None)
                if voice_channel_filter is not None and ch_id != voice_channel_filter:
                    continue
                members_out.append({"id": str(m.id), "name": str(m.display_name), "channel_id": str(ch_id)})
            else:
                roles = list(getattr(m, "roles", []) or [])
                roles = [r for r in roles if getattr(r, "id", None) != everyone_id]
                if len(roles) == 0:
                    continue
                members_out.append({"id": str(m.id), "name": str(m.display_name)})
    except Exception:
        members_out = []

    members_out.sort(key=lambda x: str(x.get("name", "")).lower())
    return web.json_response(
        {"success": True, "guild_id": gid, "filter": filt, "members": members_out, "channels": channels_out}
    )

VALID_ATT_DAYS = frozenset({"mon", "tue", "wed", "thu", "fri"})
VALID_ATT_MARKS = frozenset({"", "check", "x"})

def _guild_role_members(guild) -> list:
    members_out = []
    everyone_id = guild.id
    for m in guild.members:
        if m is None or m.bot:
            continue
        roles = list(getattr(m, "roles", []) or [])
        roles = [r for r in roles if getattr(r, "id", None) != everyone_id]
        if len(roles) == 0:
            continue
        members_out.append({"id": str(m.id), "name": str(m.display_name)})
    members_out.sort(key=lambda x: str(x.get("name", "")).lower())
    return members_out

async def api_members_roster_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    if request.method == "GET":
        guild_id = request.query.get("guild_id", "").strip()
        week = request.query.get("week", "").strip()
        if not guild_id:
            cfg = _configured_guild_id()
            if cfg is not None:
                guild_id = str(cfg)
        if not guild_id.isdigit():
            return await _json_error(400, "Invalid guild_id")
        if not week:
            return await _json_error(400, "Missing week")
        gid = int(guild_id)

        guild = bot.get_guild(gid)
        if guild is None:
            return await _json_error(404, "Guild not found")
        sess_user_id = int((sess.get("user") or {}).get("id") or 0)
        if sess_user_id and guild.get_member(sess_user_id) is None:
            return await _json_error(403, "Not a member of this guild")

        can_manage = await _can_manage_guild(sess, gid)
        base_members = _guild_role_members(guild)
        user_ids = [int(m["id"]) for m in base_members]

        roles_map = {}
        att_map = {}
        conn = _db_connect()
        try:
            cur = conn.cursor()
            if user_ids:
                placeholders = ",".join("?" * len(user_ids))
                try:
                    cur.execute(
                        f"SELECT user_id, primary_role, secondary_role FROM member_roles WHERE guild_id = ? AND user_id IN ({placeholders})",
                        [gid, *user_ids],
                    )
                    for row in cur.fetchall():
                        roles_map[int(row["user_id"])] = {
                            "primary_role": str(row["primary_role"] or ""),
                            "secondary_role": str(row["secondary_role"] or ""),
                        }
                    cur.execute(
                        f"SELECT user_id, day, mark FROM member_attendance WHERE guild_id = ? AND week = ? AND user_id IN ({placeholders})",
                        [gid, week, *user_ids],
                    )
                    for row in cur.fetchall():
                        uid = int(row["user_id"])
                        att_map.setdefault(uid, {})[str(row["day"])] = str(row["mark"] or "")
                except sqlite3.OperationalError as db_err:
                    print(f"[roster] Error DB, migrando tablas y reintentando: {db_err}")
                    conn.close()
                    _db_migrate_member_roster()
                    conn = _db_connect()
                    cur = conn.cursor()
                    cur.execute(
                        f"SELECT user_id, primary_role, secondary_role FROM member_roles WHERE guild_id = ? AND user_id IN ({placeholders})",
                        [gid, *user_ids],
                    )
                    for row in cur.fetchall():
                        roles_map[int(row["user_id"])] = {
                            "primary_role": str(row["primary_role"] or ""),
                            "secondary_role": str(row["secondary_role"] or ""),
                        }
                    cur.execute(
                        f"SELECT user_id, day, mark FROM member_attendance WHERE guild_id = ? AND week = ? AND user_id IN ({placeholders})",
                        [gid, week, *user_ids],
                    )
                    for row in cur.fetchall():
                        uid = int(row["user_id"])
                        att_map.setdefault(uid, {})[str(row["day"])] = str(row["mark"] or "")
        finally:
            conn.close()

        out = []
        for m in base_members:
            uid = int(m["id"])
            r = roles_map.get(uid, {})
            att = att_map.get(uid, {})
            out.append({
                "user_id": str(uid),
                "name": m["name"],
                "primary_role": r.get("primary_role", ""),
                "secondary_role": r.get("secondary_role", ""),
                "attendance": {d: att.get(d, "") for d in ("mon", "tue", "wed", "thu", "fri")},
            })

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "week": week,
            "can_manage": can_manage,
            "members": out,
        })

    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            return await _json_error(400, "Invalid JSON")
        if not isinstance(body, dict):
            return await _json_error(400, "Invalid body")

        guild_id = str(body.get("guild_id", "")).strip()
        week = str(body.get("week", "")).strip()
        user_id = str(body.get("user_id", "")).strip()
        if not guild_id.isdigit():
            return await _json_error(400, "Invalid guild_id")
        if not week:
            return await _json_error(400, "Missing week")
        if not user_id.isdigit():
            return await _json_error(400, "Invalid user_id")
        gid = int(guild_id)
        uid = int(user_id)

        if not await _can_manage_guild(sess, gid):
            return await _json_error(403, "Forbidden")

        guild = bot.get_guild(gid)
        if guild is None:
            return await _json_error(404, "Guild not found")
        if guild.get_member(uid) is None:
            return await _json_error(404, "User not in guild")

        conn = _db_connect()
        try:
            cur = conn.cursor()

            if "primary_role" in body or "secondary_role" in body:
                primary = str(body.get("primary_role", "")).strip() if "primary_role" in body else None
                secondary = str(body.get("secondary_role", "")).strip() if "secondary_role" in body else None
                cur.execute(
                    "SELECT primary_role, secondary_role FROM member_roles WHERE guild_id = ? AND user_id = ?",
                    (gid, uid),
                )
                row = cur.fetchone()
                if row:
                    p = primary if primary is not None else str(row["primary_role"] or "")
                    s = secondary if secondary is not None else str(row["secondary_role"] or "")
                    cur.execute(
                        "UPDATE member_roles SET primary_role = ?, secondary_role = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?",
                        (p, s, gid, uid),
                    )
                else:
                    p = primary if primary is not None else ""
                    s = secondary if secondary is not None else ""
                    cur.execute(
                        "INSERT INTO member_roles (guild_id, user_id, primary_role, secondary_role) VALUES (?, ?, ?, ?)",
                        (gid, uid, p, s),
                    )

            if "day" in body:
                day = str(body.get("day", "")).strip().lower()
                mark = str(body.get("mark", "")).strip().lower()
                if day not in VALID_ATT_DAYS:
                    return await _json_error(400, "Invalid day")
                if mark not in VALID_ATT_MARKS:
                    return await _json_error(400, "Invalid mark")
                if mark == "":
                    cur.execute(
                        "DELETE FROM member_attendance WHERE guild_id = ? AND user_id = ? AND week = ? AND day = ?",
                        (gid, uid, week, day),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO member_attendance (guild_id, user_id, week, day, mark, updated_at)
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(guild_id, user_id, week, day)
                        DO UPDATE SET mark = excluded.mark, updated_at = CURRENT_TIMESTAMP
                        """,
                        (gid, uid, week, day, mark),
                    )

            conn.commit()
        finally:
            conn.close()

        return web.json_response({"success": True})

    return await _json_error(405, "Method not allowed")

async def api_members_roster_apply_voice_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")

    try:
        body = await request.json()
    except Exception:
        return await _json_error(400, "Invalid JSON")
    if not isinstance(body, dict):
        return await _json_error(400, "Invalid body")

    guild_id = str(body.get("guild_id", "")).strip()
    week = str(body.get("week", "")).strip()
    voice_channel_id = str(body.get("voice_channel_id", "")).strip()
    day = str(body.get("day", "")).strip().lower()

    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    if not week:
        return await _json_error(400, "Missing week")
    if not voice_channel_id.isdigit():
        return await _json_error(400, "Invalid voice_channel_id")
    if day not in VALID_ATT_DAYS:
        return await _json_error(400, "Invalid day (solo Lun–Vie)")

    gid = int(guild_id)
    vch_id = int(voice_channel_id)

    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    guild = bot.get_guild(gid)
    if guild is None:
        return await _json_error(404, "Guild not found")

    voice_channel = guild.get_channel(vch_id)
    voice_channel_name = str(getattr(voice_channel, "name", voice_channel_id))

    base_members = _guild_role_members(guild)
    if not base_members:
        return web.json_response({
            "success": True,
            "day": day,
            "week": week,
            "voice_channel_id": str(vch_id),
            "voice_channel_name": voice_channel_name,
            "present_count": 0,
            "absent_count": 0,
        })

    present_ids: set[int] = set()
    try:
        for m in guild.members:
            if m is None or m.bot:
                continue
            if not (m.voice and m.voice.channel is not None):
                continue
            if int(getattr(m.voice.channel, "id", 0) or 0) != vch_id:
                continue
            present_ids.add(int(m.id))
    except Exception:
        present_ids = set()

    present_count = 0
    absent_count = 0
    conn = _db_connect()
    try:
        cur = conn.cursor()
        for m in base_members:
            uid = int(m["id"])
            mark = "check" if uid in present_ids else "x"
            if mark == "check":
                present_count += 1
            else:
                absent_count += 1
            cur.execute(
                """
                INSERT INTO member_attendance (guild_id, user_id, week, day, mark, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(guild_id, user_id, week, day)
                DO UPDATE SET mark = excluded.mark, updated_at = CURRENT_TIMESTAMP
                """,
                (gid, uid, week, day, mark),
            )
        conn.commit()
    finally:
        conn.close()

    return web.json_response({
        "success": True,
        "day": day,
        "week": week,
        "voice_channel_id": str(vch_id),
        "voice_channel_name": voice_channel_name,
        "present_count": present_count,
        "absent_count": absent_count,
    })

async def api_channels_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    guild = bot.get_guild(gid)
    if guild is None:
        return await _json_error(404, "Guild not found")

    out = []
    try:
        chans = list(getattr(guild, "text_channels", []) or [])
        for ch in chans:
            cid = getattr(ch, "id", None)
            if cid is None:
                continue
            out.append({"id": str(cid), "name": str(getattr(ch, "name", cid))})
    except Exception:
        out = []
    out.sort(key=lambda x: str(x.get("name", "")).lower())
    return web.json_response({"success": True, "guild_id": gid, "channels": out})

async def api_activities_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    if request.method == "GET":
        guild_id = request.query.get("guild_id", "").strip()
        if not guild_id:
            cfg = _configured_guild_id()
            if cfg is not None:
                guild_id = str(cfg)
        if not guild_id.isdigit():
            return await _json_error(400, "Invalid guild_id")
        gid = int(guild_id)
        if not await _can_manage_guild(sess, gid):
            return await _json_error(403, "Forbidden")

        conn = _db_connect()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, guild_id, name, total_amount, per_person_amount, island, status, created_at, created_by, channel_id, date
                FROM activities
                WHERE guild_id = ?
                ORDER BY id DESC
                LIMIT 200
                """,
                (gid,),
            )
            rows = cur.fetchall()
            acts = [dict(r) for r in rows]
            return web.json_response({"success": True, "guild_id": gid, "activities": acts})
        finally:
            conn.close()

    if request.method != "POST":
        return await _json_error(405, "Method not allowed")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    name = str(payload.get("name", "")).strip()
    date = str(payload.get("date", "")).strip()
    status = str(payload.get("status", "pending")).strip().lower() or "pending"
    channel_id = str(payload.get("channel_id", "")).strip()

    try:
        total_amount = int(payload.get("total_amount", 0))
    except Exception:
        total_amount = 0

    if not guild_id.isdigit() or not channel_id.isdigit():
        return await _json_error(400, "Invalid params")
    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    if not name:
        return await _json_error(400, "Missing name")
    if not date:
        return await _json_error(400, "Missing date")
    if total_amount <= 0:
        return await _json_error(400, "Invalid total_amount")
    if status not in {"pending", "in_process", "deposited"}:
        return await _json_error(400, "Invalid status")

    participants_in = payload.get("participants")
    if not isinstance(participants_in, list) or len(participants_in) == 0:
        return await _json_error(400, "Missing participants")

    user_ids: list[int] = []
    for p in participants_in:
        if not isinstance(p, dict):
            continue
        try:
            uid = int(p.get("user_id"))
        except Exception:
            uid = None
        if uid is None:
            continue
        if uid < 0:
            continue
        user_ids.append(uid)
    if len(user_ids) == 0:
        return await _json_error(400, "Invalid participants")
    if 0 not in user_ids:
        return await _json_error(400, "Guild participant (user_id=0) is required")

    unique_user_ids = []
    seen = set()
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        unique_user_ids.append(uid)

    per_person_amount = int(total_amount // len(unique_user_ids))
    remainder = int(total_amount - (per_person_amount * len(unique_user_ids)))

    created_by = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if created_by <= 0:
        return await _json_error(403, "Invalid session")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO activities (guild_id, name, total_amount, per_person_amount, island, status, created_by, channel_id, date)
            VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
            """,
            (gid, name, total_amount, per_person_amount, status, created_by, int(channel_id), date),
        )
        activity_id = int(cur.lastrowid or 0)
        if activity_id <= 0:
            return await _json_error(500, "Failed to create activity")

        for uid in unique_user_ids:
            amt = per_person_amount
            if uid == 0:
                amt += remainder
            cur.execute(
                "INSERT INTO activity_participants (activity_id, user_id, amount) VALUES (?, ?, ?)",
                (activity_id, uid, amt),
            )
            if uid != 0:
                cur.execute(
                    "INSERT OR IGNORE INTO user_balance (guild_id, user_id, balance) VALUES (?, ?, 0)",
                    (gid, uid),
                )
                cur.execute(
                    "UPDATE user_balance SET balance = balance + ? WHERE guild_id = ? AND user_id = ?",
                    (amt, gid, uid),
                )
                cur.execute(
                    """
                    INSERT INTO payment_history (guild_id, user_id, amount, admin_id, paid_at, transaction_type)
                    VALUES (?, ?, ?, ?, datetime('now', 'localtime'), 'loot_earned')
                    """,
                    (gid, uid, amt, created_by),
                )
        conn.commit()
        return web.json_response({"success": True, "guild_id": gid, "activity_id": activity_id})
    finally:
        conn.close()

async def api_admin_history_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    user_id = request.query.get("user_id", "").strip()
    limit = request.query.get("limit", "50").strip()
    if not guild_id.isdigit() or not user_id.isdigit() or (limit and not limit.isdigit()):
        return await _json_error(400, "Invalid params")
    gid = int(guild_id)
    uid = int(user_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")
    lim = max(1, min(200, int(limit)))

    guild = bot.get_guild(gid)
    _name_cache: dict[int, str] = {}

    async def resolve_name(xid: int) -> str:
        if xid == 0:
            return "Sistema"
        if xid in _name_cache:
            return _name_cache[xid]
        name = str(xid)
        try:
            if guild is not None:
                member = guild.get_member(xid)
                if member is None:
                    member = await guild.fetch_member(xid)
                if member is not None:
                    name = member.display_name
        except Exception:
            pass
        if name == str(xid):
            try:
                user = await bot.fetch_user(xid)
                name = user.name or str(xid)
            except Exception:
                pass
        _name_cache[xid] = name
        return name

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, amount, admin_id, paid_at, transaction_type
            FROM payment_history
            WHERE guild_id = ? AND user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (gid, uid, lim),
        )
        rows = cur.fetchall()
        history = []
        for r in rows:
            item = dict(r)
            admin_id = int(item.get("admin_id") or 0)
            item["admin_name"] = await resolve_name(admin_id)
            history.append(item)
        return web.json_response(
            {
                "success": True,
                "guild_id": gid,
                "user_id": uid,
                "history": history,
            }
        )
    finally:
        conn.close()

async def api_admin_can_manage_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)
    return web.json_response(
        {"success": True, "guild_id": gid, "can_manage": await _can_manage_guild(sess, gid)}
    )

async def api_owner_can_manage_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)
    return web.json_response({"success": True, "guild_id": gid, "can_manage": await _is_guild_owner(sess, gid)})

async def api_owner_finance_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)
    if not await _is_guild_owner(sess, gid):
        return await _json_error(403, "Forbidden")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT balance FROM guild_finance WHERE guild_id = ?", (gid,))
        row = cur.fetchone()
        guild_balance = int(row[0]) if row else 0

        cur.execute("SELECT COALESCE(SUM(balance), 0) FROM user_balance WHERE guild_id = ? AND balance > 0", (gid,))
        total_debt = int(cur.fetchone()[0] or 0)

        color, ratio_pct = _debt_status_color(total_debt, guild_balance)
        return web.json_response(
            {
                "success": True,
                "guild_id": gid,
                "guild_balance": guild_balance,
                "total_debt": total_debt,
                "status_color": color,
                "debt_ratio_pct": ratio_pct,
            }
        )
    finally:
        conn.close()

async def api_owner_guild_balance_handler(request: web.Request) -> web.StreamResponse:
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    mode = str(payload.get("mode", "set")).strip().lower()
    amount_raw = payload.get("amount", 0)

    if not guild_id.isdigit() or mode not in {"set", "add"}:
        return await _json_error(400, "Invalid params")
    try:
        amount = int(amount_raw)
    except Exception:
        return await _json_error(400, "Invalid amount")

    gid = int(guild_id)
    if not await _is_guild_owner(sess, gid):
        return await _json_error(403, "Forbidden")

    admin_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if admin_id <= 0:
        return await _json_error(403, "Invalid session")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("INSERT OR IGNORE INTO guild_finance (guild_id, balance) VALUES (?, 0)", (gid,))
        if mode == "set":
            cur.execute(
                "UPDATE guild_finance SET balance = ?, updated_at = datetime('now', 'localtime') WHERE guild_id = ?",
                (amount, gid),
            )
            cur.execute(
                "INSERT INTO guild_ledger (guild_id, amount, admin_id, created_at, tx_type) VALUES (?, ?, ?, datetime('now', 'localtime'), 'set_guild_balance')",
                (gid, amount, admin_id),
            )
        else:
            cur.execute(
                "UPDATE guild_finance SET balance = balance + ?, updated_at = datetime('now', 'localtime') WHERE guild_id = ?",
                (amount, gid),
            )
            cur.execute(
                "INSERT INTO guild_ledger (guild_id, amount, admin_id, created_at, tx_type) VALUES (?, ?, ?, datetime('now', 'localtime'), 'deposit_guild')",
                (gid, amount, admin_id),
            )

        cur.execute("SELECT balance FROM guild_finance WHERE guild_id = ?", (gid,))
        new_bal = int(cur.fetchone()[0] or 0)
        conn.commit()
        return web.json_response({"success": True, "guild_id": gid, "guild_balance": new_bal})
    finally:
        conn.close()

async def api_owner_weekly_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")
    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)
    if not await _is_guild_owner(sess, gid):
        return await _json_error(403, "Forbidden")

    monday = datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())
    days = [monday + datetime.timedelta(days=i) for i in range(7)]
    start_dt = datetime.datetime.combine(days[0], datetime.time.min)
    end_dt = datetime.datetime.combine(days[-1], datetime.time.max)
    start_s = start_dt.strftime("%Y-%m-%d %H:%M:%S")
    end_s = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    out = {d.isoformat(): {"deposits": 0, "payments": 0, "net": 0} for d in days}

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT amount, created_at
            FROM guild_ledger
            WHERE guild_id = ? AND created_at >= ? AND created_at <= ?
            """,
            (gid, start_s, end_s),
        )
        rows = cur.fetchall()
        for r in rows:
            amt = int(r[0] or 0)
            created_at = str(r[1] or "")
            day_key = created_at[:10] if len(created_at) >= 10 else ""
            if day_key not in out:
                continue
            out[day_key]["net"] += amt
            if amt >= 0:
                out[day_key]["deposits"] += amt
            else:
                out[day_key]["payments"] += abs(amt)

        series = []
        for d in days:
            k = d.isoformat()
            series.append({"date": k, **out[k]})

        return web.json_response({"success": True, "guild_id": gid, "week_start": days[0].isoformat(), "days": series})
    finally:
        conn.close()

async def api_admin_balance_handler(request: web.Request) -> web.StreamResponse:
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    user_id = str(payload.get("user_id", "")).strip()
    user_ids_raw = payload.get("user_ids")
    announce_channel_id = str(payload.get("announce_channel_id", "")).strip()
    amount_raw = payload.get("amount", 0)
    mode = str(payload.get("mode", "add")).strip().lower()

    user_ids: list[int] = []
    if isinstance(user_ids_raw, list):
        for x in user_ids_raw:
            try:
                xi = int(str(x).strip())
            except Exception:
                continue
            if xi > 0:
                user_ids.append(xi)
    elif user_id:
        if not user_id.isdigit():
            return await _json_error(400, "Invalid user_id")
        user_ids = [int(user_id)]

    if not guild_id.isdigit() or len(user_ids) == 0:
        return await _json_error(400, "Invalid guild_id or user_ids")
    if mode not in {"add", "set"}:
        return await _json_error(400, "Invalid mode")

    try:
        amount = int(amount_raw)
    except Exception:
        return await _json_error(400, "Invalid amount")

    gid = int(guild_id)
    admin_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if admin_id <= 0:
        return await _json_error(403, "Invalid session")
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    is_deposit = mode == "add" and amount >= 0
    if is_deposit and announce_channel_id and not announce_channel_id.isdigit():
        return await _json_error(400, "Invalid announce_channel_id")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        results = []

        cur.execute("INSERT OR IGNORE INTO guild_finance (guild_id, balance) VALUES (?, 0)", (gid,))

        for uid in user_ids:
            cur.execute(
                "INSERT OR IGNORE INTO user_balance (guild_id, user_id, balance) VALUES (?, ?, 0)",
                (gid, uid),
            )
            if mode == "set":
                cur.execute(
                    "UPDATE user_balance SET balance = ? WHERE guild_id = ? AND user_id = ?",
                    (amount, gid, uid),
                )
                cur.execute(
                    "INSERT INTO payment_history (guild_id, user_id, amount, admin_id, transaction_type) VALUES (?, ?, ?, ?, ?)",
                    (gid, uid, amount, admin_id, "set"),
                )
            else:
                tx_type = "deposit" if amount >= 0 else "payment"
                hist_amount = abs(amount)
                cur.execute(
                    "UPDATE user_balance SET balance = balance + ? WHERE guild_id = ? AND user_id = ?",
                    (amount, gid, uid),
                )
                cur.execute(
                    "INSERT INTO payment_history (guild_id, user_id, amount, admin_id, transaction_type) VALUES (?, ?, ?, ?, ?)",
                    (gid, uid, hist_amount, admin_id, tx_type),
                )

                if amount < 0:
                    cur.execute(
                        "UPDATE guild_finance SET balance = balance + ?, updated_at = datetime('now', 'localtime') WHERE guild_id = ?",
                        (amount, gid),
                    )
                    cur.execute(
                        "INSERT INTO guild_ledger (guild_id, amount, admin_id, created_at, tx_type) VALUES (?, ?, ?, datetime('now', 'localtime'), 'pay_member')",
                        (gid, amount, admin_id),
                    )

            # FIX 2: Eliminar fila si el balance quedó en 0 o negativo tras el pago
            cur.execute(
                "DELETE FROM user_balance WHERE guild_id = ? AND user_id = ? AND balance <= 0",
                (gid, uid),
            )

            cur.execute("SELECT balance FROM user_balance WHERE guild_id = ? AND user_id = ?", (gid, uid))
            row = cur.fetchone()
            new_balance = int(row[0]) if row else 0
            results.append({"user_id": uid, "new_balance": new_balance})

        conn.commit()

        if is_deposit and announce_channel_id:
            try:
                chan_id_int = int(announce_channel_id)
                channel = bot.get_channel(chan_id_int)
                if channel is None:
                    guild_obj = bot.get_guild(gid)
                    if guild_obj is not None:
                        channel = guild_obj.get_channel(chan_id_int)
                if channel is not None:
                    lines = []
                    for r in results:
                        uid = int(r["user_id"])
                        new_bal = int(r["new_balance"])
                        loaded_amt = abs(int(amount))
                        lines.append(
                            f"<@{uid}>  Cargado:{loaded_amt:,} Balance Actual:{new_bal:,}"
                        )
                    msg = "💰 **Balance cargado**\n" + "\n".join(lines)
                    await channel.send(msg)
            except Exception:
                pass

        resp = {"success": True, "guild_id": gid, "results": results}
        if len(results) == 1:
            resp["user_id"] = results[0]["user_id"]
            resp["new_balance"] = results[0]["new_balance"]
        return web.json_response(resp)
    finally:
        conn.close()

async def webhook_handler(request: web.Request) -> web.StreamResponse:
    if not _auth_ok(request):
        return await _json_error(401, "Unauthorized")

    if request.method == "GET":
        action = request.query.get("action", "")
        conn = _db_connect()
        try:
            cur = conn.cursor()
            if action == "get_balance":
                guild_id = request.query.get("guild_id", "").strip()
                user_id = request.query.get("user_id", "").strip()
                if not guild_id.isdigit() or not user_id.isdigit():

                    return await _json_error(400, "guild_id and user_id must be integers")
                cur.execute(
                    "SELECT balance FROM user_balance WHERE guild_id = ? AND user_id = ?",
                    (int(guild_id), int(user_id)),
                )
                row = cur.fetchone()
                balance = int(row[0]) if row else 0
                return web.json_response(
                    {"success": True, "guild_id": int(guild_id), "user_id": int(user_id), "balance": balance}
                )

            if action == "get_leaderboard":
                guild_id = request.query.get("guild_id", "").strip()
                limit = request.query.get("limit", "10").strip()
                if not guild_id.isdigit() or (limit and not limit.isdigit()):
                    return await _json_error(400, "guild_id and limit must be integers")
                lim = max(1, min(50, int(limit)))
                # FIX 2: Solo balance > 0 también en el webhook
                cur.execute(
                    "SELECT user_id, balance FROM user_balance WHERE guild_id = ? AND balance > 0 ORDER BY balance DESC LIMIT ?",
                    (int(guild_id), lim),
                )
                rows = cur.fetchall()
                leaderboard = [{"user_id": int(r[0]), "balance": int(r[1])} for r in rows]
                return web.json_response({"success": True, "guild_id": int(guild_id), "leaderboard": leaderboard})

            if action == "get_history":
                guild_id = request.query.get("guild_id", "").strip()
                user_id = request.query.get("user_id", "").strip()
                limit = request.query.get("limit", "50").strip()
                if not guild_id.isdigit() or not user_id.isdigit() or (limit and not limit.isdigit()):
                    return await _json_error(400, "guild_id, user_id and limit must be integers")
                lim = max(1, min(200, int(limit)))
                cur.execute(
                    """
                    SELECT id, amount, admin_id, paid_at, transaction_type
                    FROM payment_history
                    WHERE guild_id = ? AND user_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (int(guild_id), int(user_id), lim),
                )
                rows = cur.fetchall()
                history = [dict(r) for r in rows]
                return web.json_response({"success": True, "guild_id": int(guild_id), "user_id": int(user_id), "history": history})

            return await _json_error(400, "Invalid action")
        finally:
            conn.close()

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    action = payload.get("action", "")
    if request.method == "POST":
        return await _json_error(400, "Invalid action")

    if request.method == "PUT":
        return await _json_error(400, "Invalid action")

    if request.method == "DELETE":
        return await _json_error(400, "Invalid action")

    return await _json_error(405, "Method not allowed")


async def api_activity_detail_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    activity_id = request.query.get("activity_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit() or not activity_id.isdigit():
        return await _json_error(400, "Invalid params")

    gid = int(guild_id)
    aid = int(activity_id)

    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    guild = bot.get_guild(gid)

    async def resolve_name(xid: int) -> str:
        if xid == 0:
            return "Guild"
        if guild is None:
            return str(xid)
        try:
            member = guild.get_member(xid)
            if member is None:
                member = await guild.fetch_member(xid)
            if member is not None:
                return str(member.display_name or member.name or xid)
        except discord.NotFound:
            pass
        except Exception:
            pass
        try:
            user = await bot.fetch_user(xid)
            return str(user.name or xid)
        except Exception:
            return str(xid)

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, guild_id, name, total_amount, per_person_amount,
                   island, status, created_at, created_by, channel_id, date
            FROM activities
            WHERE guild_id = ? AND id = ?
            LIMIT 1
            """,
            (gid, aid),
        )
        row = cur.fetchone()
        if not row:
            return await _json_error(404, "Activity not found")

        activity = dict(row)

        cur.execute(
            """
            SELECT user_id, amount
            FROM activity_participants
            WHERE activity_id = ?
            ORDER BY user_id ASC
            """,
            (aid,),
        )
        part_rows = cur.fetchall()
        participants = []
        for r in part_rows:
            item = dict(r)
            uid = int(item.get("user_id") or 0)
            item["user_name"] = await resolve_name(uid)
            participants.append(item)

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "activity": activity,
            "participants": participants,
        })
    finally:
        conn.close()


async def api_activity_patch_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        return await _json_error(400, "Invalid JSON")

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)

    activity_ids_raw = payload.get("activity_ids", [])
    new_status = str(payload.get("status", "")).strip().lower()
    island = str(payload.get("island", "")).strip() or None

    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    if not isinstance(activity_ids_raw, list) or len(activity_ids_raw) == 0:
        return await _json_error(400, "Missing activity_ids")
    if new_status not in {"pending", "in_process", "deposited"}:
        return await _json_error(400, "Invalid status. Must be: pending | in_process | deposited")

    try:
        activity_ids = [int(x) for x in activity_ids_raw]
    except Exception:
        return await _json_error(400, "Invalid activity_ids")

    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(activity_ids))

        cur.execute(
            f"SELECT id FROM activities WHERE guild_id = ? AND id IN ({placeholders})",
            [gid] + activity_ids,
        )
        found_ids = {row[0] for row in cur.fetchall()}
        missing = [aid for aid in activity_ids if aid not in found_ids]
        if missing:
            return await _json_error(404, f"Activities not found: {missing}")

        if island:
            cur.execute(
                f"UPDATE activities SET status = ?, island = ? WHERE guild_id = ? AND id IN ({placeholders})",
                [new_status, island, gid] + activity_ids,
            )
        else:
            cur.execute(
                f"UPDATE activities SET status = ? WHERE guild_id = ? AND id IN ({placeholders})",
                [new_status, gid] + activity_ids,
            )

        conn.commit()
        return web.json_response({
            "success": True,
            "guild_id": gid,
            "activity_ids": activity_ids,
            "status": new_status,
            "island": island,
        })
    finally:
        conn.close()


async def api_activity_finalize_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        return await _json_error(400, "Invalid JSON")

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)

    activity_ids_raw = payload.get("activity_ids", [])
    island = str(payload.get("island", "")).strip()
    channel_id = str(payload.get("channel_id", "")).strip()

    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    if not isinstance(activity_ids_raw, list) or len(activity_ids_raw) == 0:
        return await _json_error(400, "Missing activity_ids")
    if not island:
        return await _json_error(400, "Missing island")
    if not channel_id or not channel_id.isdigit():
        return await _json_error(400, "Missing or invalid channel_id")

    try:
        activity_ids = [int(x) for x in activity_ids_raw]
    except Exception:
        return await _json_error(400, "Invalid activity_ids")

    gid = int(guild_id)
    admin_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if admin_id <= 0:
        return await _json_error(403, "Invalid session")
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    guild = bot.get_guild(gid)

    async def resolve_name(xid: int) -> str:
        if xid == 0:
            return "Guild"
        if guild is None:
            return str(xid)
        try:
            member = guild.get_member(xid)
            if member is None:
                member = await guild.fetch_member(xid)
            if member is not None:
                return str(member.display_name or member.name or xid)
        except discord.NotFound:
            pass
        except Exception:
            pass
        try:
            user = await bot.fetch_user(xid)
            return str(user.name or xid)
        except Exception:
            return str(xid)

    conn = _db_connect()
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(activity_ids))

        cur.execute(
            f"SELECT id FROM activities WHERE guild_id = ? AND id IN ({placeholders})",
            [gid] + activity_ids,
        )
        found_ids = {row[0] for row in cur.fetchall()}
        missing = [aid for aid in activity_ids if aid not in found_ids]
        if missing:
            return await _json_error(404, f"Activities not found: {missing}")

        member_totals: dict[int, int] = {}
        for aid in activity_ids:
            cur.execute(
                "SELECT user_id, amount FROM activity_participants WHERE activity_id = ?",
                (aid,),
            )
            for r in cur.fetchall():
                uid = int(r[0])
                amt = int(r[1])
                member_totals[uid] = member_totals.get(uid, 0) + amt

        cur.execute(
            f"UPDATE activities SET status = 'deposited', island = ? WHERE guild_id = ? AND id IN ({placeholders})",
            [island, gid] + activity_ids,
        )

        results = []
        for uid, total_amt in member_totals.items():
            if uid == 0:
                continue

            cur.execute(
                "INSERT OR IGNORE INTO user_balance (guild_id, user_id, balance) VALUES (?, ?, 0)",
                (gid, uid),
            )
            cur.execute(
                "UPDATE user_balance SET balance = MAX(0, balance - ?) WHERE guild_id = ? AND user_id = ?",
                (total_amt, gid, uid),
            )
            cur.execute(
                """
                INSERT INTO payment_history (guild_id, user_id, amount, admin_id, paid_at, transaction_type)
                VALUES (?, ?, ?, ?, datetime('now', 'localtime'), 'loot_deposited')
                """,
                (gid, uid, total_amt, admin_id),
            )

            # FIX 2: Eliminar fila si el balance quedó en 0 tras depositar
            cur.execute(
                "DELETE FROM user_balance WHERE guild_id = ? AND user_id = ? AND balance = 0",
                (gid, uid),
            )

            cur.execute(
                "SELECT balance FROM user_balance WHERE guild_id = ? AND user_id = ?",
                (gid, uid),
            )
            row = cur.fetchone()
            new_balance = int(row[0]) if row else 0
            results.append({
                "user_id": uid,
                "user_name": await resolve_name(uid),
                "amount_deposited": total_amt,
                "new_balance": new_balance,
            })

        conn.commit()

        try:
            chan_id_int = int(channel_id)
            channel = bot.get_channel(chan_id_int)
            if channel is None and guild is not None:
                channel = guild.get_channel(chan_id_int)
            if channel is not None:
                lines = []
                for r in sorted(results, key=lambda x: x["user_name"].lower()):
                    uid = int(r["user_id"])
                    amt = int(r["amount_deposited"])
                    lines.append(f"<@{uid}> 🪙 {amt:,}")

                msg = (
                    "# ✅ Split Depositado.\n"
                    f"📍 **Isla:** {island}.\n\n"
                    + "\n".join(lines)
                )
                msg += "\n\n" + "https://royalvoidlootsplit.vercel.app/"
                await channel.send(msg)
        except Exception:
            pass

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "island": island,
            "activity_ids": activity_ids,
            "results": results,
        })
    finally:
        conn.close()


async def api_audit_week_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")

    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    today   = datetime.date.today()
    monday  = today - datetime.timedelta(days=today.weekday())
    sunday  = monday + datetime.timedelta(days=6)
    week_start = monday.isoformat()
    week_end   = sunday.isoformat()

    guild = bot.get_guild(gid)
    _name_cache: dict[int, str] = {}

    async def resolve_name(xid: int) -> str:
        if xid == 0:
            return "Guild"
        if xid in _name_cache:
            return _name_cache[xid]
        name = str(xid)
        try:
            if guild is not None:
                member = guild.get_member(xid)
                if member is None:
                    member = await guild.fetch_member(xid)
                if member is not None:
                    name = str(member.display_name or member.name or xid)
        except discord.NotFound:
            pass
        except Exception:
            pass
        if name == str(xid):
            try:
                user = await bot.fetch_user(xid)
                name = str(user.name or xid)
            except Exception:
                pass
        _name_cache[xid] = name
        return name

    conn = _db_connect()
    try:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, name, total_amount, status, date
            FROM activities
            WHERE guild_id = ? AND date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (gid, week_start, week_end),
        )
        act_rows = cur.fetchall()

        total_earned     = 0
        total_deposited  = 0
        activity_count   = len(act_rows)

        acts_map: dict[int, dict] = {}
        for r in act_rows:
            aid    = int(r[0])
            status = str(r[3] or "pending").lower()
            amt    = int(r[2] or 0)
            if status == "deposited":
                total_deposited += amt
            acts_map[aid] = {
                "activity_id": aid,
                "name":        str(r[1] or ""),
                "date":        str(r[4] or ""),
                "total_amount": amt,
                "status":      status,
            }

        member_map: dict[int, dict] = {}
        guild_earned = 0

        if acts_map:
            placeholders = ",".join("?" * len(acts_map))
            cur.execute(
                f"""
                SELECT ap.activity_id, ap.user_id, ap.amount
                FROM activity_participants ap
                WHERE ap.activity_id IN ({placeholders})
                """,
                list(acts_map.keys()),
            )
            for r in cur.fetchall():
                aid = int(r[0])
                uid = int(r[1])
                amt = int(r[2])
                act_info = acts_map.get(aid, {})
                if uid == 0:
                    guild_earned += amt
                    continue
                if uid not in member_map:
                    member_map[uid] = {"total_earned": 0, "activities": []}
                member_map[uid]["total_earned"] += amt
                member_map[uid]["activities"].append({
                    "activity_id": aid,
                    "name":        act_info.get("name", ""),
                    "date":        act_info.get("date", ""),
                    "amount":      amt,
                    "status":      act_info.get("status", "pending"),
                })

        total_earned = guild_earned

        members_out = []
        for uid, info in sorted(member_map.items(), key=lambda x: -x[1]["total_earned"]):
            members_out.append({
                "user_id":     str(uid),
                "user_name":   await resolve_name(uid),
                "total_earned": info["total_earned"],
                "activities":  sorted(info["activities"], key=lambda a: a["date"]),
            })

        return web.json_response({
            "success":         True,
            "guild_id":        gid,
            "week_start":      week_start,
            "week_end":        week_end,
            "total_earned":    total_earned,
            "total_deposited": total_deposited,
            "activity_count":  activity_count,
            "members":         members_out,
        })
    finally:
        conn.close()


async def api_audit_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")

    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    user_id_raw = request.query.get("user_id", "").strip()
    tx_type     = request.query.get("tx_type", "").strip().lower()
    limit_raw   = request.query.get("limit", "200").strip()
    lim = max(1, min(500, int(limit_raw) if limit_raw.isdigit() else 200))

    valid_tx = {"loot_earned", "loot_deposited", "deposit", "payment", "set"}

    guild = bot.get_guild(gid)
    _name_cache: dict[int, str] = {}

    async def resolve_name(xid: int) -> str:
        if xid == 0:
            return "Sistema"
        if xid in _name_cache:
            return _name_cache[xid]
        name = str(xid)
        try:
            if guild is not None:
                member = guild.get_member(xid)
                if member is None:
                    member = await guild.fetch_member(xid)
                if member is not None:
                    name = str(member.display_name or member.name or xid)
        except discord.NotFound:
            pass
        except Exception:
            pass
        if name == str(xid):
            try:
                user = await bot.fetch_user(xid)
                name = str(user.name or xid)
            except Exception:
                pass
        _name_cache[xid] = name
        return name

    conn = _db_connect()
    try:
        cur = conn.cursor()

        conditions = ["guild_id = ?"]
        params: list = [gid]

        if user_id_raw and user_id_raw.isdigit():
            conditions.append("user_id = ?")
            params.append(int(user_id_raw))

        if tx_type and tx_type in valid_tx:
            conditions.append("transaction_type = ?")
            params.append(tx_type)

        where = " AND ".join(conditions)
        params.append(lim)

        cur.execute(
            f"""
            SELECT id, user_id, amount, admin_id, paid_at, transaction_type
            FROM payment_history
            WHERE {where}
            ORDER BY id DESC
            LIMIT ?
            """,
            params,
        )
        rows = cur.fetchall()
        history = []
        for r in rows:
            item = dict(r)
            uid      = int(item.get("user_id") or 0)
            admin_id = int(item.get("admin_id") or 0)
            item["user_id"]    = str(uid)
            item["user_name"]  = await resolve_name(uid)
            item["admin_id"]   = str(admin_id)
            item["admin_name"] = await resolve_name(admin_id)
            history.append(item)

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "count": len(history),
            "history": history,
        })
    finally:
        conn.close()


async def api_zvz_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    if request.method == "GET":
        guild_id = request.query.get("guild_id", "").strip()
        if not guild_id.isdigit():
            return await _json_error(400, "Invalid guild_id")
        gid = int(guild_id)
        if not _session_has_guild(sess, gid):
            return await _json_error(403, "Guild not allowed")

        conn = _db_connect()
        try:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS zvz_state (
                        guild_id INTEGER PRIMARY KEY,
                        state_json TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.commit()
            except sqlite3.OperationalError as e:
                return await _json_error(500, f"DB error: {e}")
            cur.execute("SELECT state_json FROM zvz_state WHERE guild_id = ? LIMIT 1", (gid,))
            row = cur.fetchone()
            if not row:
                return web.json_response({"success": True, "guild_id": gid, "state": {"roles": {}}})

            try:
                raw = row["state_json"]
            except Exception:
                raw = row[0] if isinstance(row, (tuple, list)) else None
            try:
                state = json.loads(raw) if raw else {"roles": {}}
            except Exception:
                state = {"roles": {}}
            if not isinstance(state, dict):
                state = {"roles": {}}
            if "roles" not in state or not isinstance(state.get("roles"), dict):
                state["roles"] = {}
            return web.json_response({"success": True, "guild_id": gid, "state": state})
        except sqlite3.OperationalError as e:
            return await _json_error(500, f"DB error: {e}")
        finally:
            conn.close()

    if request.method == "POST":
        try:
            payload = await request.json()
        except Exception as e:
            print(f"[ZVZ DEBUG] Error parsing JSON: {e}")
            payload = {}

        print(f"\n[ZVZ DEBUG] ========== NUEVA SOLICITUD POST /api/zvz ==========")
        print(f"[ZVZ DEBUG] Payload completo: {payload}")

        guild_id = str((payload or {}).get("guild_id", "")).strip()
        state = (payload or {}).get("state")
        action = str((payload or {}).get("action", "")).strip().lower()
        role_name = str((payload or {}).get("role_name", "")).strip()
        member_name = str((payload or {}).get("member_name", "")).strip()
        member_id = str((payload or {}).get("member_id", "")).strip()
        color = str((payload or {}).get("color", "")).strip()

        print(f"[ZVZ DEBUG] Guild ID: {guild_id}")
        print(f"[ZVZ DEBUG] Action: {action}")
        print(f"[ZVZ DEBUG] Role Name: {role_name}")
        print(f"[ZVZ DEBUG] Member Name: {member_name}")
        print(f"[ZVZ DEBUG] Member ID: {member_id or 'no enviado'}")
        print(f"[ZVZ DEBUG] Color: {color}")

        if not guild_id.isdigit():
            print(f"[ZVZ DEBUG] ERROR: Guild ID no es número")
            return await _json_error(400, "Invalid guild_id")
        gid = int(guild_id)

        if not _session_has_guild(sess, gid):
            print(f"[ZVZ DEBUG] ERROR: Sesión no tiene este guild")
            return await _json_error(403, "Guild not allowed")

        if not await _can_manage_guild(sess, gid):
            print(f"[ZVZ DEBUG] ERROR: Usuario no puede manejar este guild")
            return await _json_error(403, "Forbidden")

        guild = bot.get_guild(gid)
        if not guild:
            print(f"[ZVZ DEBUG] ERROR: Guild {gid} no encontrado en el bot")
            return await _json_error(400, "Guild not found in bot")

        print(f"[ZVZ DEBUG] Guild encontrado: {guild.name} (ID: {guild.id})")

        # ── ACTION: create_role ────────────────────────────────────────
        if action == "create_role" and role_name and color:
            print(f"[ZVZ DEBUG] → Ejecutando CREATE_ROLE")
            result = await zvz_create_discord_role(guild, role_name, color)
            print(f"[ZVZ DEBUG] Resultado: {result}")
            if not result['success']:
                return await _json_error(400, result['error'])
            return web.json_response({"success": True, "guild_id": gid, "action": "create_role", "role_id": result['role_id']})

        # ── ACTION: delete_role ────────────────────────────────────────
        if action == "delete_role" and role_name:
            print(f"[ZVZ DEBUG] → Ejecutando DELETE_ROLE")
            result = await zvz_delete_discord_role(guild, role_name)
            print(f"[ZVZ DEBUG] Resultado: {result}")
            if not result['success']:
                return await _json_error(400, result['error'])
            return web.json_response({"success": True, "guild_id": gid, "action": "delete_role"})

        # ── ACTION: add_member ─────────────────────────────────────────
        if action == "add_member" and member_name and role_name:
            print(f"[ZVZ DEBUG] → Ejecutando ADD_MEMBER")
            result = await zvz_assign_role_to_member(guild, member_name, role_name, member_id)
            print(f"[ZVZ DEBUG] Resultado: {result}")
            if not result['success']:
                return await _json_error(400, result['error'])
            return web.json_response({"success": True, "guild_id": gid, "action": "add_member"})

        # ── ACTION: remove_member ──────────────────────────────────────
        if action == "remove_member" and member_name and role_name:
            print(f"[ZVZ DEBUG] → Ejecutando REMOVE_MEMBER")
            result = await zvz_remove_role_from_member(guild, member_name, role_name, member_id)
            print(f"[ZVZ DEBUG] Resultado: {result}")
            if not result['success']:
                return await _json_error(400, result['error'])
            return web.json_response({"success": True, "guild_id": gid, "action": "remove_member"})

        # ── ACTION: sync ───────────────────────────────────────────────
        if action == "sync":
            print(f"[ZVZ DEBUG] → Ejecutando SYNC")
            if not isinstance(state, dict):
                state = {"roles": {}}
            if "roles" not in state:
                state["roles"] = {}

            try:
                state_json = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
            except Exception:
                return await _json_error(400, "Invalid state")
            if len(state_json) > 200_000:
                return await _json_error(413, "State too large")

            conn = _db_connect()
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO zvz_state (guild_id, state_json, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(guild_id) DO UPDATE SET
                        state_json = excluded.state_json,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (gid, state_json),
                )
                conn.commit()
                return web.json_response({"success": True, "guild_id": gid, "action": "sync", "state": state})
            except sqlite3.OperationalError as e:
                return await _json_error(500, f"DB error: {e}")
            finally:
                conn.close()

        # ── Default: guardar estado normal ─────────────────────────────
        if not isinstance(state, dict):
            return await _json_error(400, "Invalid state")
        if "roles" not in state or not isinstance(state.get("roles"), dict):
            return await _json_error(400, "Invalid state")

        try:
            state_json = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            return await _json_error(400, "Invalid state")
        if len(state_json) > 200_000:
            return await _json_error(413, "State too large")

        conn = _db_connect()
        try:
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS zvz_state (
                        guild_id INTEGER PRIMARY KEY,
                        state_json TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            except sqlite3.OperationalError as e:
                return await _json_error(500, f"DB error: {e}")
            cur.execute(
                """
                INSERT INTO zvz_state (guild_id, state_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(guild_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (gid, state_json),
            )
            conn.commit()
            return web.json_response({"success": True, "guild_id": gid})
        except sqlite3.OperationalError as e:
            return await _json_error(500, f"DB error: {e}")
        finally:
            conn.close()

    return await _json_error(405, "Method not allowed")


async def api_activity_points_handler(request: web.Request) -> web.StreamResponse:
    """
    ✅ FIX NICKNAMES: Este endpoint ahora devuelve los apodos del servidor
    en lugar de los nombres globales de Discord.
    """
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")

    gid = int(guild_id)
    if not _session_has_guild(sess, gid):
        return await _json_error(403, "Guild not allowed")

    user_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if user_id <= 0:
        return await _json_error(403, "Invalid session")

    now_ms = int(time.time() * 1000)
    
    guild = bot.get_guild(gid)

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM activity_codes WHERE guild_id = ? AND expires_at < ?", (gid, now_ms))
        conn.commit()

        cur.execute(
            "SELECT user_id, user_name, points FROM activity_points WHERE guild_id = ? ORDER BY points DESC LIMIT 50",
            (gid,),
        )
        rows = cur.fetchall()
        leaderboard = []
        
        for r in rows:
            uid = int(r[0])
            points = int(r[2])
            
            # ✅ ACTUALIZAR NOMBRE CON APODO DEL SERVIDOR
            if guild:
                display_name = await get_display_name(guild, uid)
            else:
                display_name = str(r[1]) or str(uid)
            
            leaderboard.append({
                "user_id": str(uid),
                "user_name": display_name,
                "points": points
            })

        my_points = 0
        my_rank = None
        for i, entry in enumerate(leaderboard):
            if int(entry["user_id"]) == user_id:
                my_points = entry["points"]
                my_rank = i + 1
                break

        total_points = sum(e["points"] for e in leaderboard)
        participant_count = len(leaderboard)

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "leaderboard": leaderboard[:10],
            "my_points": my_points,
            "my_rank": my_rank,
            "total_points": total_points,
            "participant_count": participant_count,
        })
    finally:
        conn.close()


async def api_activity_redeem_handler(request: web.Request) -> web.StreamResponse:
    """
    ✅ FIX NICKNAMES: Este endpoint ahora guarda el apodo del servidor
    en lugar del nombre global de Discord.
    """
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")

    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    code = str(payload.get("code", "")).strip()

    if not guild_id.isdigit() or not code:
        return await _json_error(400, "Invalid params")

    gid = int(guild_id)
    if not _session_has_guild(sess, gid):
        return await _json_error(403, "Guild not allowed")

    user_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if user_id <= 0:
        return await _json_error(403, "Invalid session")

    # ✅ FIX: Obtener el apodo del servidor en lugar del nombre global
    guild = bot.get_guild(gid)
    if guild:
        user_name = await get_display_name(guild, user_id)
    else:
        user_info = sess.get("user") or {}
        user_name = str(user_info.get("global_name") or user_info.get("username") or str(user_id))

    now_ms = int(time.time() * 1000)

    conn = _db_connect()
    try:
        cur = conn.cursor()

        cur.execute(
            "SELECT uses_remaining, points_per_use, expires_at FROM activity_codes WHERE guild_id = ? AND code = ?",
            (gid, code),
        )
        row = cur.fetchone()
        if not row:
            return await _json_error(400, "Código inválido o expirado")

        uses_remaining, points_per_use, expires_at = int(row[0]), int(row[1]), int(row[2])

        if expires_at < now_ms:
            cur.execute("DELETE FROM activity_codes WHERE guild_id = ? AND code = ?", (gid, code))
            conn.commit()
            return await _json_error(400, "Código expirado")

        if uses_remaining <= 0:
            return await _json_error(400, "Sin usos disponibles")

        cur.execute(
            "SELECT 1 FROM activity_code_uses WHERE guild_id = ? AND code = ? AND user_id = ?",
            (gid, code, user_id),
        )
        if cur.fetchone():
            return await _json_error(400, "Ya usaste este código")

        cur.execute(
            "INSERT OR IGNORE INTO activity_code_uses (guild_id, code, user_id) VALUES (?, ?, ?)",
            (gid, code, user_id),
        )
        new_uses = uses_remaining - 1
        if new_uses <= 0:
            cur.execute("DELETE FROM activity_codes WHERE guild_id = ? AND code = ?", (gid, code))
        else:
            cur.execute(
                "UPDATE activity_codes SET uses_remaining = ? WHERE guild_id = ? AND code = ?",
                (new_uses, gid, code),
            )

        cur.execute(
            "INSERT INTO activity_points (guild_id, user_id, user_name, points) VALUES (?, ?, ?, ?)"
            " ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + ?, user_name = ?, updated_at = datetime('now','localtime')",
            (gid, user_id, user_name, points_per_use, points_per_use, user_name),
        )

        cur.execute(
            "SELECT points FROM activity_points WHERE guild_id = ? AND user_id = ?",
            (gid, user_id),
        )
        new_total = int((cur.fetchone() or [0])[0])
        conn.commit()

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "points_earned": points_per_use,
            "total_points": new_total,
        })
    finally:
        conn.close()


async def api_activity_gen_handler(request: web.Request) -> web.StreamResponse:
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")

    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)

    try:
        uses = int(payload.get("uses", 0))
        points = int(payload.get("points", 0))
    except Exception:
        return await _json_error(400, "Invalid uses/points")

    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    if uses < 1 or uses > 999:
        return await _json_error(400, "Uses must be 1–999")
    if points < 1 or points > 9999:
        return await _json_error(400, "Points must be 1–9999")

    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    user_id = int(str((sess.get("user") or {}).get("id") or 0) or 0)
    if user_id <= 0:
        return await _json_error(403, "Invalid session")

    now_ms = int(time.time() * 1000)
    expires_at = now_ms + 5 * 60 * 1000  # 5 minutos

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM activity_codes WHERE guild_id = ? AND expires_at < ?", (gid, now_ms))

        import random
        for _ in range(20):
            code = str(random.randint(1000, 9999))
            cur.execute("SELECT 1 FROM activity_codes WHERE guild_id = ? AND code = ?", (gid, code))
            if not cur.fetchone():
                break
        else:
            return await _json_error(500, "No se pudo generar código único")

        cur.execute(
            "INSERT INTO activity_codes (guild_id, code, uses_remaining, uses_total, points_per_use, expires_at, created_by)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (gid, code, uses, uses, points, expires_at, user_id),
        )
        conn.commit()

        return web.json_response({
            "success": True,
            "guild_id": gid,
            "code": code,
            "uses": uses,
            "points": points,
            "expires_at": expires_at,
        })
    finally:
        conn.close()


async def api_activity_codes_handler(request: web.Request) -> web.StreamResponse:
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    guild_id = request.query.get("guild_id", "").strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")

    gid = int(guild_id)
    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    now_ms = int(time.time() * 1000)
    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM activity_codes WHERE guild_id = ? AND expires_at < ?", (gid, now_ms))
        conn.commit()
        cur.execute(
            "SELECT code, uses_remaining, uses_total, points_per_use, expires_at FROM activity_codes WHERE guild_id = ? ORDER BY expires_at ASC",
            (gid,),
        )
        rows = cur.fetchall()
        codes = [
            {"code": r[0], "uses_remaining": r[1], "uses_total": r[2], "points_per_use": r[3], "expires_at": r[4]}
            for r in rows
        ]
        return web.json_response({"success": True, "guild_id": gid, "codes": codes})
    finally:
        conn.close()


async def api_activity_reset_handler(request: web.Request) -> web.StreamResponse:
    if request.method != "POST":
        return await _json_error(405, "Method not allowed")

    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    guild_id = str(payload.get("guild_id", "")).strip()
    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")

    gid = int(guild_id)
    if not await _is_guild_owner(sess, gid):
        return await _json_error(403, "Forbidden — solo el dueño puede resetear")

    conn = _db_connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM activity_points WHERE guild_id = ?", (gid,))
        count = int((cur.fetchone() or [0])[0])
        cur.execute("DELETE FROM activity_points WHERE guild_id = ?", (gid,))
        cur.execute("DELETE FROM activity_codes WHERE guild_id = ?", (gid,))
        cur.execute("DELETE FROM activity_code_uses WHERE guild_id = ?", (gid,))
        conn.commit()
        return web.json_response({"success": True, "guild_id": gid, "reset_count": count})
    finally:
        conn.close()


async def api_admin_debts_handler(request: web.Request) -> web.StreamResponse:
    """
    Handler único para /api/admin/debts:
        GET    -> lista deudas del gremio (?guild_id=)
        POST   -> crea deuda  {guild_id, name, desc, cat, amount}
        PATCH  -> marca pagada/no pagada {guild_id, id, paid}
        DELETE -> elimina deuda (?guild_id=&id=)
    Solo usuarios con permiso de gestión del gremio pueden usarlo.
    """
    sess = _require_session(request)
    if not sess:
        return await _json_error(401, "Not logged in")

    method = request.method.upper()

    if method == "GET":
        guild_id = request.query.get("guild_id", "").strip()
    elif method == "DELETE":
        guild_id = request.query.get("guild_id", "").strip()
    else:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        guild_id = str(payload.get("guild_id", "")).strip()

    if not guild_id:
        cfg = _configured_guild_id()
        if cfg is not None:
            guild_id = str(cfg)
    if not guild_id.isdigit():
        return await _json_error(400, "Invalid guild_id")
    gid = int(guild_id)

    if not await _can_manage_guild(sess, gid):
        return await _json_error(403, "Forbidden")

    user_id = 0
    try:
        user_id = int(str(((sess.get("user") or {}).get("id")) or 0) or 0)
    except Exception:
        user_id = 0

    conn = _db_connect()
    try:
        cur = conn.cursor()

        if method == "GET":
            cur.execute(
                """
                SELECT id, name, description, category, amount, paid, created_at, paid_at
                FROM guild_debts
                WHERE guild_id = ?
                ORDER BY paid ASC, created_at DESC
                """,
                (gid,),
            )
            rows = cur.fetchall()
            debts = []
            for r in rows:
                debts.append({
                    "id": int(r["id"]),
                    "name": str(r["name"] or ""),
                    "desc": str(r["description"] or ""),
                    "cat": str(r["category"] or "equipo"),
                    "amount": int(r["amount"] or 0),
                    "paid": bool(r["paid"]),
                    "date": str(r["created_at"] or "")[:10],
                    "created_at": str(r["created_at"] or ""),
                    "paid_at": str(r["paid_at"] or "") if r["paid_at"] else None,
                })
            return web.json_response({"success": True, "guild_id": gid, "debts": debts})

        if method == "POST":
            name = str(payload.get("name", "")).strip()
            desc = str(payload.get("desc", "")).strip()
            cat = str(payload.get("cat", "")).strip().lower()
            try:
                amount = int(payload.get("amount", 0))
            except Exception:
                return await _json_error(400, "Invalid amount")
            if not name:
                return await _json_error(400, "name required")
            if cat not in {"equipo", "pago", "mant"}:
                return await _json_error(400, "Invalid category")
            if amount <= 0:
                return await _json_error(400, "Amount must be > 0")

            cur.execute(
                """
                INSERT INTO guild_debts (guild_id, name, description, category, amount, paid, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, 0, datetime('now', 'localtime'), ?)
                """,
                (gid, name[:100], desc[:500], cat, amount, user_id),
            )
            new_id = int(cur.lastrowid)
            conn.commit()
            return web.json_response({"success": True, "id": new_id})

        if method == "PATCH":
            try:
                debt_id = int(payload.get("id", 0))
            except Exception:
                return await _json_error(400, "Invalid id")
            if debt_id <= 0:
                return await _json_error(400, "Invalid id")
            paid = bool(payload.get("paid", False))

            cur.execute(
                "SELECT id FROM guild_debts WHERE id = ? AND guild_id = ?",
                (debt_id, gid),
            )
            if cur.fetchone() is None:
                return await _json_error(404, "Debt not found")

            if paid:
                cur.execute(
                    "UPDATE guild_debts SET paid = 1, paid_at = datetime('now', 'localtime'), paid_by = ? WHERE id = ? AND guild_id = ?",
                    (user_id, debt_id, gid),
                )
            else:
                cur.execute(
                    "UPDATE guild_debts SET paid = 0, paid_at = NULL, paid_by = NULL WHERE id = ? AND guild_id = ?",
                    (debt_id, gid),
                )
            conn.commit()
            return web.json_response({"success": True, "id": debt_id, "paid": paid})

        if method == "DELETE":
            debt_id_raw = request.query.get("id", "").strip()
            if not debt_id_raw.isdigit():
                return await _json_error(400, "Invalid id")
            debt_id = int(debt_id_raw)
            cur.execute(
                "DELETE FROM guild_debts WHERE id = ? AND guild_id = ?",
                (debt_id, gid),
            )
            conn.commit()
            return web.json_response({"success": True, "id": debt_id, "deleted": True})

        return await _json_error(405, "Method not allowed")
    finally:
        conn.close()


async def start_webhook_server() -> tuple[web.AppRunner, web.TCPSite]:

    _db_init()
    _db_migrate_member_roster()
    _db_fix_negative_balances()
    _db_cleanup_zero_balances()  # FIX 2: limpiar filas con balance = 0 al arrancar

    app = web.Application(middlewares=[_cors_middleware])
    app.router.add_get("/login", login_handler)
    app.router.add_get("/oauth/callback", oauth_callback_handler)
    app.router.add_get("/logout", logout_handler)
    app.router.add_get("/api/me", api_me_handler)
    app.router.add_get("/api/guilds", api_guilds_handler)
    app.router.add_get("/api/balance", api_balance_handler)
    app.router.add_get("/api/history", api_history_handler)
    app.router.add_get("/api/leaderboard", api_leaderboard_handler)
    app.router.add_get("/api/members", api_members_handler)
    app.router.add_route("GET", "/api/members/roster", api_members_roster_handler)
    app.router.add_route("POST", "/api/members/roster", api_members_roster_handler)
    app.router.add_post("/api/members/roster/apply-voice", api_members_roster_apply_voice_handler)
    app.router.add_get("/api/channels", api_channels_handler)
    app.router.add_route("GET", "/api/activities", api_activities_handler)
    app.router.add_route("POST", "/api/activities", api_activities_handler)
    app.router.add_get("/api/activity_detail", api_activity_detail_handler)
    app.router.add_route("PATCH", "/api/activities", api_activity_patch_handler)
    app.router.add_post("/api/activities/finalize", api_activity_finalize_handler)
    app.router.add_get("/api/admin/can_manage", api_admin_can_manage_handler)
    app.router.add_post("/api/admin/balance", api_admin_balance_handler)
    app.router.add_get("/api/admin/history", api_admin_history_handler)
    app.router.add_get("/api/audit", api_audit_handler)
    app.router.add_get("/api/audit/week", api_audit_week_handler)
    app.router.add_get("/api/owner/can_manage", api_owner_can_manage_handler)
    app.router.add_get("/api/owner/finance", api_owner_finance_handler)
    app.router.add_post("/api/owner/guild_balance", api_owner_guild_balance_handler)
    app.router.add_get("/api/owner/weekly", api_owner_weekly_handler)

    if os.getenv("SERVE_WEB", "1").strip() != "0":
        app.router.add_get("/", index_handler)
        app.router.add_get("/{filename}", static_file_handler)

    app.router.add_route("*", "/webhook", webhook_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"Webhook HTTP activo en 0.0.0.0:{port}")
    return runner, site

async def main():
    extensions = []
    runner = None
    async with bot:
        runner, _site = await start_webhook_server()
        for ext in extensions:
            try:
                await bot.load_extension(ext)
                print(f"Módulo {ext} cargado correctamente")
            except Exception as e:
                print(f"Error al cargar {ext}: {e}")

        TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
        if not TOKEN:
            raise RuntimeError("Missing DISCORD_BOT_TOKEN env var")
        try:
            await bot.start(TOKEN)
        finally:
            if runner is not None:
                await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
