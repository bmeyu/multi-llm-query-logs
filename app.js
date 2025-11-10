const INDEX_PATH = "./runs/index.json"
const logContainer = document.getElementById("log-container")
const refreshBtn = document.getElementById("refresh-btn")
const scheduleFilter = document.getElementById("schedule-filter")
const modelFilter = document.getElementById("model-filter")
const scenarioFilter = document.getElementById("scenario-filter")

let entries = []

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
    logContainer.appendChild(card)
  })
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

