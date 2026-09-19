# Vincit Manager ⚽

App tipus "Fantasy" personalitzada per al club de futbol sala **Vincit**.
Cada participant gestiona una plantilla de 5 jugadors (futbol sala) fitxats
d'entre els jugadors reals dels equips del club, i puntua segons el que facin
cada jornada.

## Arquitectura

| Part | Tecnologia | On viu |
|---|---|---|
| Frontend | React + Vite + Tailwind | Desplegat a **Vercel** |
| Backend / Base de dades | **Supabase** (Postgres + Auth) | Gratuït, al núvol |

GitHub Pages només serveix fitxers estàtics i no pot fer autenticació real ni
guardar dades de formularis — per això el backend és Supabase (pla gratuït,
sense targeta). El frontend es desplega a Vercel perquè s'integra en 2 minuts
i és igual de gratuït.

## Estructura del projecte

```
vincit-manager/
├── supabase/
│   ├── schema.sql        # Totes les taules i vistes
│   ├── policies.sql      # Seguretat (qui pot llegir/escriure què)
│   ├── functions.sql     # Operacions atòmiques (comprar, vendre)
│   └── seed_example.sql  # Dades d'exemple per provar
├── src/
│   ├── lib/supabaseClient.js
│   ├── context/AuthContext.jsx     # Sessió i login
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── Topbar.jsx
│   │   ├── Pitch.jsx                # Camp de futbol sala amb els 5 titulars
│   │   ├── PlayerBadge.jsx
│   │   ├── ConfirmPasswordField.jsx
│   │   └── ProtectedRoute.jsx
│   └── pages/
│       ├── Login.jsx
│       ├── Home.jsx        # Pantalla 1: Classificació + log de moviments
│       ├── Market.jsx      # Pantalla 2: Mercat de fitxatges
│       ├── Squad.jsx       # Pantalla 3: Plantilles (visual, pista)
│       ├── Teams.jsx       # Pantalla 4: Resum d'equips del club
│       ├── Forms/          # Pantalla 5: els 4 formularis
│       │   ├── OfferForm.jsx
│       │   ├── SellForm.jsx
│       │   ├── LineupForm.jsx
│       │   └── CoachForm.jsx
│       └── Admin.jsx       # Dashboard de l'administrador
```

## 1. Crear el backend (Supabase) — 10 minuts

1. Crea un compte gratuït a **https://supabase.com** i un nou projecte.
2. Ves a **SQL Editor** i executa, per aquest ordre, el contingut de:
   1. `supabase/schema.sql`
   2. `supabase/policies.sql`
   3. `supabase/functions.sql`
   4. (opcional, per fer proves) `supabase/seed_example.sql`
3. Ves a **Project Settings → API** i copia:
   - `Project URL`
   - `anon public key`

## 2. Configurar el frontend en local

```bash
npm install
cp .env.example .env.local
# edita .env.local amb la URL i la clau que has copiat de Supabase
npm run dev
```

## 3. Crear els usuaris (managers)

Supabase Auth necessita un email per usuari. Com que els jugadors només
tindran "usuari" i contrasenya, l'app fa servir automàticament
`usuari@vincit.local` per darrere — no cal que ho facis servir tu enlloc,
és transparent.

Per cada persona del grup:

1. A Supabase Dashboard → **Authentication → Users → Add user**
   - Email: `nomusuari@vincit.local`
   - Password: la que vulguis donar-li
   - Marca **Auto Confirm User**
2. Copia el `UUID` generat.
3. A **SQL Editor**, executa:
   ```sql
   insert into managers (user_id, username, display_name, is_admin, is_coach)
   values ('<UUID-copiat>', 'nomusuari', 'Nom Complet', false, true);
   ```
   - `is_admin = true` → aquesta persona podrà entrar al Dashboard d'administració.
   - `is_coach = true` → podrà accedir al formulari de l'entrenador.
4. Si és entrenador, vincula'l al seu equip:
   ```sql
   insert into coach_assignments (manager_id, team_id)
   select m.id, t.id from managers m, club_teams t
   where m.username = 'nomusuari' and t.name = 'Sènior A';
   ```

> 💡 Consell: fes-te tu mateix el primer usuari, amb `is_admin = true`, per
> poder gestionar la resta des del dashboard d'administració de l'app un cop
> desplegada.

## 4. Desplegar a Vercel — 5 minuts

1. Puja aquest projecte a un repositori de GitHub.
2. Entra a **https://vercel.com**, "Add New Project" i importa el repositori.
3. A "Environment Variables" afegeix:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Ja tens la web pública.

(Si prefereixes GitHub Pages: `npm run build` genera la carpeta `dist/`,
que pots publicar amb l'acció `actions/deploy-pages`. Amb Vercel no cal cap
pas manual addicional, per això ho recomanem.)

## Com funciona el joc, resumit

- **Inici**: classificació general (suma de punts de totes les jornades) i
  un registre (log) de cada moviment: fitxatges, vendes, nous jugadors al
  mercat, canvis d'alineació.
- **Mercat**: tots els jugadors disponibles (nous o posats a la venda per
  altres managers), amb preu i temps restant.
- **Plantilles**: es pot consultar la plantilla de qualsevol participant amb
  un selector — la pista mostra els 5 titulars, i la banqueta la resta.
- **Resum d'equips**: els equips reals del Vincit (Aleví A, Cadet B
  Femení...) amb els punts de cada jugador, filtrable per jornada.
- **Formularis** (requereixen usuari + reconfirmar contrasenya):
  - *Fer oferta*: apostar per un jugador del mercat.
  - *Vendre jugador*: posar un jugador propi a la venda (2 dies al mercat).
  - *Canviar titular*: triar qui juga aquesta jornada sense perdre cap
    jugador de la plantilla.
  - *Entrenador*: puntuar els jugadors del seu equip després del partit
    (assistència, punts, gols ⚽, assistències 👟, parades 🧤).
- **Administració** (només l'administrador):
  - Fixar preus i decidir quins jugadors surten al mercat cada setmana.
  - Acceptar ofertes pendents (tanca el mercat i transfereix jugador + diners
    de forma atòmica).
  - Crear jornades i marcar quina és l'actual.
  - Com que les polítiques de seguretat donen accés total a l'administrador,
    també pot editar qualsevol dada directament des de l'Editor de taules de
    Supabase per a casos puntuals (p.ex. corregir un error d'un formulari).

## Notes tècniques importants

- **Seguretat**: cada taula té Row Level Security activada. Tothom pot
  *llegir* classificació, mercat, plantilles i equips (és un joc social),
  però només el propietari (o l'admin) pot *escriure* les seves pròpies
  dades.
- **Operacions atòmiques**: acceptar una oferta mou diners i canvia la
  propietat d'un jugador alhora — es fa amb una funció de base de dades
  (`accept_transfer_offer`) perquè mai quedi a mitges.
- **Caducitat del mercat**: el camp `market_expires_at` marca quan caduca un
  fitxatge (7 dies) o una venda (2 dies). En aquesta primera versió cal que
  l'administrador retiri manualment els jugadors caducats des del dashboard;
  si es vol automatitzar del tot, es pot afegir una Supabase Edge Function
  programada (cron) que ho faci sola — no és necessari per començar.
