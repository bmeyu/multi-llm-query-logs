const INDEX_PATH = "./runs/index.json"
const logContainer = document.getElementById("log-container")
const refreshBtn = document.getElementById("refresh-btn")
const scheduleFilter = document.getElementById("schedule-filter")
const modelFilter = document.getElementById("model-filter")
const scenarioFilter = document.getElementById("scenario-filter")

let entries = []
const runDetailCache = new Map()

refreshBtn.addEventListener("click", () => loadIndex(true))
scheduleFilter.addEventListener("change", renderEntries)
modelFilter.addEventListener("change", renderEntries)
scenarioFilter.addEventListener("change", renderEntries)

loadIndex(false)

async function loadIndex(force) {
  setStatus("正在加载...")
  try {
    const url = force ? `${INDEX_PATH}?t=${Date.now()}` : INDEX_PATH
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`获取 index 失败：${response.status}`)
    }
    const payload = await response.json()
    entries = payload.entries ?? []
    hydrateFilters(entries)
    renderEntries()
  } catch (error) {
    console.error(error)
    setStatus("加载失败，请稍后重试。")
  }
}

function hydrateFilters(list) {
  const scheduleSet = new Map()
  const modelSet = new Set()
  const scenarioSet = new Set()

  list.forEach((entry) => {
    if (entry.scheduleId && !scheduleSet.has(entry.scheduleId)) {
      scheduleSet.set(entry.scheduleId, entry.scheduleName ?? entry.scheduleId)
    }
    entry.modelIds?.forEach((id) => modelSet.add(id))
    entry.scenarioIds?.forEach((id) => scenarioSet.add(id))
  })

  fillSelect(scheduleFilter, scheduleSet)
  fillSelect(modelFilter, modelSet)
  fillSelect(scenarioFilter, scenarioSet)
}

function fillSelect(select, values) {
  const previous = select.value
  while (select.options.length > 1) {
    select.remove(1)
  }
  if (values instanceof Map) {
    values.forEach((label, value) => {
      const option = document.createElement("option")
      option.value = value
      option.textContent = label
      select.appendChild(option)
    })
  } else {
    Array.from(values).forEach((value) => {
      const option = document.createElement("option")
      option.value = value
      option.textContent = value
      select.appendChild(option)
    })
  }
  if (Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous
  } else {
    select.value = "all"
  }
}

function renderEntries() {
  if (!entries.length) {
    setStatus("暂无运行记录。")
    return
  }

  const filtered = entries.filter((entry) => {
    const matchesSchedule =
      scheduleFilter.value === "all" ||
      entry.scheduleId === scheduleFilter.value

    const matchesModel =
      modelFilter.value === "all" ||
      entry.modelIds?.includes(modelFilter.value)

    const matchesScenario =
      scenarioFilter.value === "all" ||
      entry.scenarioIds?.includes(scenarioFilter.value)

    return matchesSchedule && matchesModel && matchesScenario
  })

  if (!filtered.length) {
    setStatus("筛选条件下无记录。")
    return
  }

  logContainer.innerHTML = ""
  filtered.forEach((entry) => {
    const card = document.createElement("article")
    card.className = "log-card"

    const title = document.createElement("h2")
    title.textContent = entry.scheduleName || entry.id

    const meta = document.createElement("p")
    meta.className = "meta"
    meta.textContent = [
      `时间：${formatDate(entry.createdAt)}`,
      `来源：${entry.source}`,
      `运行数：${entry.runCount}`,
    ].join(" · ")

    const list = document.createElement("ul")
    list.innerHTML = `
      <li>模型：${entry.modelIds?.join(", ") ?? "—"}</li>
      <li>场景：${entry.scenarioIds?.join(", ") ?? "—"}</li>
      <li>JSON：<a href="${entry.jsonPath}" target="_blank" rel="noreferrer">${entry.jsonPath}</a></li>
      <li>CSV：<a href="${entry.csvPath}" target="_blank" rel="noreferrer">${entry.csvPath}</a></li>
    `

    card.appendChild(title)
    card.appendChild(meta)
    if (entry.scheduleId) {
      const badge = document.createElement("span")
      badge.className = "badge"
      badge.textContent = entry.scheduleId
      card.appendChild(badge)
    }
    card.appendChild(list)
    renderKeywordSection(card, entry)
    logContainer.appendChild(card)
  })
}

function renderKeywordSection(card, entry) {
  const section = document.createElement("div")
  section.className = "keyword-section"
  section.innerHTML = `<div class="keyword-loading">关键词命中概览加载中...</div>`
  card.appendChild(section)

  loadRunDetail(entry)
    .then((detail) => {
      const summary = buildKeywordSummary(detail)
      section.innerHTML = ""
      section.appendChild(summary)
    })
    .catch((error) => {
      console.error(error)
      section.innerHTML = `<div class="keyword-error">无法加载关键词明细</div>`
    })
}

async function loadRunDetail(entry) {
  const cacheKey = entry.id || entry.createdAt
  if (runDetailCache.has(cacheKey)) {
    return runDetailCache.get(cacheKey)
  }

  if (!entry.jsonPath) {
    throw new Error("entry 缺少 jsonPath")
  }

  const response = await fetch(entry.jsonPath)
  if (!response.ok) {
    throw new Error(`读取 ${entry.jsonPath} 失败：${response.status}`)
  }
  const detail = await response.json()
  runDetailCache.set(cacheKey, detail)
  return detail
}

function buildKeywordSummary(detail) {
  const fragment = document.createDocumentFragment()
  const runs = Array.isArray(detail?.runs) ? detail.runs : []
  const stepItems = []

  runs.forEach((run) => {
    const steps = run?.result?.steps ?? []
    steps.forEach((step) => {
      stepItems.push({
        adapter: run.adapterName || run.adapterId,
        scenario: run.scenarioName || run.scenarioId,
        stepId: step.stepId,
        keywordSummary: step.metadata?.keywordSummary,
      })
    })
  })

  if (!stepItems.length) {
    const empty = document.createElement("div")
    empty.className = "keyword-empty"
    empty.textContent = "暂无关键词数据"
    fragment.appendChild(empty)
    return fragment
  }

  let totalExpected = 0
  let totalHits = 0
  let totalMissed = 0

  stepItems.forEach((item) => {
    const summary = item.keywordSummary || {}
    const expected = Array.isArray(summary.expected)
      ? summary.expected.length
      : 0
    const hits = Array.isArray(summary.hits) ? summary.hits.length : 0
    const missed = Array.isArray(summary.missed) ? summary.missed.length : 0
    totalExpected += expected
    totalHits += hits
    totalMissed += missed
  })

  const overview = document.createElement("div")
  overview.className = "keyword-overview"
  overview.innerHTML = `
    <span>关键词：${totalHits}/${totalExpected} 命中</span>
    <span class="badge-hit">命中 ${totalHits}</span>
    <span class="badge-miss">缺失 ${totalMissed}</span>
  `
  fragment.appendChild(overview)

  const list = document.createElement("div")
  list.className = "keyword-steps"

  stepItems.forEach((item) => {
    const summary = item.keywordSummary || {}
    const step = document.createElement("div")
    step.className = "keyword-step"

    const header = document.createElement("div")
    header.className = "keyword-step-header"
    header.innerHTML = `
      <div>
        <span class="step-id">${item.stepId}</span>
        <span class="step-adapter">${item.adapter || "—"}</span>
      </div>
      <span class="${summary.allHit ? "chip-hit" : "chip-miss"}">
        ${summary.allHit ? "全部命中" : "需关注"}
      </span>
    `

    const body = document.createElement("div")
    body.className = "keyword-step-body"
    body.innerHTML = `
      <div>预期：${formatKeywordList(summary.expected)}</div>
      <div>命中：<span class="text-hit">${formatKeywordList(summary.hits)}</span></div>
      <div>未命中：<span class="text-miss">${formatKeywordList(summary.missed)}</span></div>
    `

    step.appendChild(header)
    step.appendChild(body)
    list.appendChild(step)
  })

  fragment.appendChild(list)
  return fragment
}

function formatKeywordList(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "—"
  }
  return list.join("，")
}

function setStatus(text) {
  logContainer.innerHTML = `<div class="empty">${text}</div>`
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}
