// Teste de carga (k6) contra a API real: gestores a consultar o planeamento, as folhas de horas e as listas,
// com 1000 trabalhadores e 90 dias de dados (dados-carga.sql). Sessão real com CSRF.
//   docker run --rm --network host -e BASE=http://localhost:8089 -i grafana/k6 run - < scripts/carga/carga.js
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE || 'http://localhost:8088'
const EMAIL = __ENV.EMAIL || 'demo@andaime.test'
const PASSWORD = __ENV.PASSWORD || 'demo-local-andaime-2026'

export const options = {
  scenarios: {
    gestores: { executor: 'constant-vus', vus: 20, duration: '60s' },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{pedido:quadro}': ['p(95)<1500'],
    'http_req_duration{pedido:folhas}': ['p(95)<1500'],
    'http_req_duration{pedido:trabalhadores}': ['p(95)<500'],
    'http_req_duration{pedido:obras}': ['p(95)<500'],
  },
}

function monday(offsetWeeks) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + offsetWeeks * 7)
  return d.toISOString().slice(0, 10)
}

export function setup() {
  const jar = http.cookieJar()
  http.get(`${BASE}/api/auth/csrf`)
  const token = jar.cookiesForURL(BASE)['XSRF-TOKEN'][0]
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
  })
  check(login, { 'login 200': (r) => r.status === 200 })
  const me = http.get(`${BASE}/api/me`).json()
  const org = me.memberships.find((m) => m.orgName.startsWith('Construções Ribeira Alta')).orgId
  return { org, session: jar.cookiesForURL(BASE).ANDAIME_SESSION[0] }
}

export default function (data) {
  const params = (tag) => ({ cookies: { ANDAIME_SESSION: data.session }, tags: { pedido: tag } })
  const week = monday(Math.floor(Math.random() * 6) - 2)
  const sunday = new Date(Date.parse(week) + 6 * 86400000).toISOString().slice(0, 10)
  const responses = [
    http.get(`${BASE}/api/orgs/${data.org}/planning/board?from=${week}&to=${sunday}`, params('quadro')),
    http.get(`${BASE}/api/orgs/${data.org}/timesheets?week=${monday(-1)}`, params('folhas')),
    http.get(`${BASE}/api/orgs/${data.org}/employees?size=50&page=${Math.floor(Math.random() * 20)}`, params('trabalhadores')),
    http.get(`${BASE}/api/orgs/${data.org}/sites`, params('obras')),
  ]
  for (const r of responses) check(r, { '200': (x) => x.status === 200 })
  sleep(1)
}
