const REPORT_PATH = "./geo-report.json"

const metaEl = document.getElementById("geo-meta")
const scenariosEl = document.getElementById("geo-scenarios")
const sourcesEl = document.getElementById("geo-sources")

loadReport()

async function loadReport() {
  try {
    const response = await fetch(`${REPORT_PATH}?t=${Date.now()}`)
    if (!response.ok) {
      throw new Error(`加载 GEO 报告失败：${response.status}`)
    }
    const payload = await response.json()
    renderMeta(payload)
    renderScenarios(payload.scenarios || [])
    renderSources(payload.sources || [])
  } catch (error) {
    console.error(error)
    if (metaEl) metaEl.textContent = "加载失败，请稍后重试。"
    if (scenariosEl) scenariosEl.innerHTML = '<div class="empty">无法加载场景结果。</div>'
    if (sourcesEl) sourcesEl.innerHTML = '<div class="empty">无法加载来源列表。</div>'
  }
}

function renderMeta(payload) {
  if (!metaEl) return
  const createdAt = payload.createdAt
    ? new Date(payload.createdAt).toLocaleString()
    : "未知"
  const runId = payload.runId ?? "-"
  metaEl.textContent = `最新运行：${createdAt} · Run ID: ${runId}`
}

function renderScenarios(scenarios) {
  if (!scenariosEl) return
  if (!scenarios.length) {
    scenariosEl.innerHTML = '<div class="empty">暂无 GEO 结果。</div>'
    return
  }
  const table = document.createElement("table")
  table.className = "geo-table"
  table.innerHTML = `
    <thead>
      <tr>
        <th>场景</th>
        <th>模型</th>
        <th>状态</th>
        <th>提取域名</th>
        <th>步骤概览</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector("tbody")

  scenarios.forEach((item) => {
    const row = document.createElement("tr")
    const domains = collectDomains(item.steps || [])
    row.innerHTML = `
      <td>
        <div><strong>${item.scenarioName || item.scenarioId}</strong></div>
        <div class="muted">${item.scenarioId}</div>
      </td>
      <td>
        <div>${item.adapterName || item.adapterId}</div>
        <div class="muted">${item.adapterId}</div>
      </td>
      <td>${renderStatusBadge(item.status)}</td>
      <td>${renderDomains(domains)}</td>
      <td>${renderSteps(item.steps || [])}</td>
    `
    tbody.appendChild(row)
  })

  scenariosEl.innerHTML = ""
  scenariosEl.appendChild(table)
}

function renderSources(sources) {
  if (!sourcesEl) return
  if (!sources.length) {
    sourcesEl.innerHTML = '<div class="empty">暂无来源记录。</div>'
    return
  }
  const table = document.createElement("table")
  table.className = "geo-table"
  table.innerHTML = `
    <thead>
      <tr>
        <th>优先级</th>
        <th>域名</th>
        <th>链接</th>
        <th>次数</th>
        <th>备注</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector("tbody")

  sources
    .sort((a, b) => {
      const prio = { A: 0, B: 1, C: 2 }
      const pa = prio[a.priority] ?? 9
      const pb = prio[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      return (Number(b.count) || 0) - (Number(a.count) || 0)
    })
    .slice(0, 50)
    .forEach((item) => {
      const row = document.createElement("tr")
      const note = item.notes ? String(item.notes).slice(0, 120) : ""
      row.innerHTML = `
        <td>${item.priority || "-"}</td>
        <td>${item.domain || ""}</td>
        <td><a href="${item.url}" target="_blank" rel="noreferrer">${item.url}</a></td>
        <td>${item.count ?? 0}</td>
        <td class="muted">${note || "-"}</td>
      `
      tbody.appendChild(row)
    })

  sourcesEl.innerHTML = ""
  sourcesEl.appendChild(table)
}

function renderStatusBadge(status) {
  const value = status === "success" ? "成功" : "失败"
  const className = status === "success" ? "badge badge-success" : "badge badge-failed"
  return `<span class="${className}">${value}</span>`
}

function collectDomains(steps) {
  const set = new Set()
  steps.forEach((step) => {
    ;(step.extractedDomains || []).forEach((domain) => set.add(domain))
  })
  return Array.from(set)
}

function renderDomains(domains) {
  if (!domains.length) {
    return '<span class="muted">—</span>'
  }
  return `<div class="domain-list">${domains
    .slice(0, 6)
    .map((domain) => `<span class="domain-pill">${domain}</span>`)
    .join("")}</div>`
}

function renderSteps(steps) {
  if (!steps.length) {
    return '<span class="muted">—</span>'
  }
  const items = steps
    .map((step) => {
      const badge = step.status === "success" ? "badge-success" : "badge-failed"
      const preview = step.preview ? `<div class="preview">${escapeHtml(step.preview)}</div>` : ""
      return `
        <div>
          <span class="badge ${badge}">${step.stepId}</span>
          ${preview}
        </div>
      `
    })
    .join("")
  return `<div class="step-stack">${items}</div>`
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
