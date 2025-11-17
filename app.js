const INDEX_PATH = "./runs/index.json"
const logContainer = document.getElementById("log-container")
const refreshBtn = document.getElementById("refresh-btn")
const scheduleFilter = document.getElementById("schedule-filter")
const modelFilter = document.getElementById("model-filter")
const scenarioFilter = document.getElementById("scenario-filter")
const todaySummaryContainer = document.getElementById("today-summary")
const siteImpactContainer = document.getElementById("site-impact")

let entries = []
const runDetailCache = new Map()
let resumeQuestions = []

const RESUME_SCENE_ID = "ai-resume-tool-review"
const RESUME_SUMMARY_STEP_ID = "ai-resume-11"
const SITE_DICT_PATH = "./runs/site-dictionary.json"
const QUESTIONS_PATH = "./resume-questions.json"

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
    await ensureQuestions()
    hydrateFilters(entries)
    renderEntries()
    renderTodaySummary(entries).catch((error) => {
      console.error(error)
    })
    renderSiteImpact().catch((error) => {
      console.error(error)
    })
  } catch (error) {
    console.error(error)
    setStatus("加载失败，请稍后重试。")
  }
}

async function renderSiteImpact() {
  if (!siteImpactContainer) return
  siteImpactContainer.innerHTML =
    '<div class="empty">正在加载站点统计...</div>'
  try {
    const response = await fetch(`${SITE_DICT_PATH}?t=${Date.now()}`)
    if (!response.ok) {
      throw new Error(`加载 site-dictionary 失败：${response.status}`)
    }
    const payload = await response.json()
    const sites = Array.isArray(payload?.sites) ? payload.sites : []
    if (!sites.length) {
      siteImpactContainer.innerHTML =
        '<div class="empty">暂无站点统计。</div>'
      return
    }
    const topSites = sites.slice(0, 5)
    siteImpactContainer.innerHTML = ""
    siteImpactContainer.appendChild(buildImpactChart(topSites))
  } catch (error) {
    console.error(error)
    siteImpactContainer.innerHTML =
      '<div class="empty">无法加载站点统计。</div>'
  }
}

function buildImpactChart(sites) {
  const wrapper = document.createElement("div")
  wrapper.className = "impact-chart"
  const maxCount = sites.reduce(
    (max, item) => Math.max(max, item.count || 0),
    1,
  )

  sites.forEach((site) => {
    const row = document.createElement("div")
    row.className = "impact-row"

    const header = document.createElement("header")
    header.innerHTML = `<strong>${site.site}</strong><span>${site.count ?? 0} 次</span>`

    const track = document.createElement("div")
    track.className = "impact-bar-track"
    const fill = document.createElement("div")
    fill.className = "impact-bar-fill"
    const width =
      maxCount > 0 ? Math.max((site.count / maxCount) * 100, 6) : 0
    fill.style.width = `${Math.min(width, 100)}%`
    track.appendChild(fill)

    const footer = document.createElement("footer")
    const questionIds = Object.keys(site.questions ?? {})
    footer.textContent = questionIds.length
      ? `涉及问题：${questionIds.join(", ")}`
      : "涉及问题：—"

    row.appendChild(header)
    row.appendChild(track)
    row.appendChild(footer)
    wrapper.appendChild(row)
  })

  return wrapper
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

async function renderTodaySummary(list) {
  if (!todaySummaryContainer) {
    return
  }
  const resumeEntries = list.filter((entry) =>
    (entry.scenarioIds || []).includes(RESUME_SCENE_ID),
  )
  if (!resumeEntries.length) {
    todaySummaryContainer.innerHTML =
      '<div class="empty">暂无「每日简历」运行。</div>'
    return
  }

  const [latest] = resumeEntries
  todaySummaryContainer.innerHTML =
    '<div class="empty">正在加载「每日简历」总结...</div>'
  try {
    const detail = await loadRunDetail(latest)
    const summaryInfo = extractResumeSummary(detail)
    const card = buildTodaySummaryCard(latest, summaryInfo, detail)
    todaySummaryContainer.innerHTML = ""
    todaySummaryContainer.appendChild(card)
  } catch (error) {
    console.error(error)
    todaySummaryContainer.innerHTML =
      '<div class="empty">加载今日总结失败。</div>'
  }

}

function buildTodaySummaryCard(entry, summaryInfo, detail) {
  const card = document.createElement("div")
  card.className = "summary-card"

  const header = document.createElement("div")
  header.className = "summary-card-header"
  header.innerHTML = `<h3>${entry.scheduleName || entry.id}</h3>
    <span>${formatDate(entry.createdAt)} · 运行 ID：${entry.id}</span>`
  card.appendChild(header)

  const aggregate = computeKeywordAggregate(detail)
  card.appendChild(renderAggregateStats(aggregate))

  card.appendChild(renderSummaryContent(summaryInfo))
  card.appendChild(renderDailyQuestionList(detail))

  const keywordWrapper = document.createElement("div")
  keywordWrapper.className = "summary-keywords"
  keywordWrapper.appendChild(buildKeywordSummary(detail))
  card.appendChild(keywordWrapper)

  return card
}

function renderSummaryContent(summaryInfo, options = {}) {
  const container = document.createElement("div")
  container.className = "summary-content"
  if (!summaryInfo) {
    const empty = document.createElement("div")
    empty.className = "keyword-empty"
    empty.textContent = "暂无第 11 问总结。"
    container.appendChild(empty)
    return container
  }

  if (
    summaryInfo.structured &&
    typeof summaryInfo.structured === "object"
  ) {
    container.appendChild(
      renderStructuredSummary(summaryInfo.structured, options),
    )
  } else if (summaryInfo.raw) {
    const raw = document.createElement("div")
    raw.className = "summary-raw"
    raw.textContent = summaryInfo.raw
    container.appendChild(raw)
  } else {
    const placeholder = document.createElement("div")
    placeholder.className = "keyword-empty"
    placeholder.textContent = "尚未提供总结文本。"
    container.appendChild(placeholder)
  }
  return container
}

function renderStructuredSummary(summary, options = {}) {
  const fragment = document.createDocumentFragment()
  if (Array.isArray(summary.overallInsights) && summary.overallInsights.length) {
    const section = document.createElement("div")
    section.className = "summary-section"
    const title = document.createElement("h4")
    title.textContent = "总体洞察"
    section.appendChild(title)
    const list = document.createElement("ul")
    summary.overallInsights
      .slice(0, options.compact ? 2 : summary.overallInsights.length)
      .forEach((item) => {
        const type = (item.type || "趋势").toUpperCase()
        const li = document.createElement("li")
        li.textContent = `[${type}] ${item.message || ""}`
        list.appendChild(li)
      })
    section.appendChild(list)
    fragment.appendChild(section)
  }

  if (Array.isArray(summary.siteInsights) && summary.siteInsights.length) {
    const section = document.createElement("div")
    section.className = "summary-section"
    const title = document.createElement("h4")
    title.textContent = "站点摘要"
    section.appendChild(title)
    const list = document.createElement("div")
    list.className = "summary-sites"
    summary.siteInsights
      .slice(0, options.compact ? 2 : 4)
      .forEach((site) => {
        const card = document.createElement("div")
        card.className = "summary-site-card"
        const positioning = formatSummaryList(site.positioning)
        const audience = formatSummaryList(site.audienceFit)
        const highlights = formatSummaryList(site.featureHighlights)
        card.innerHTML = `<h5>${site.site || "未命名工具"}</h5>
          <p>提及：${site.mentions ?? 0} 次 · 受众：${audience}</p>
          <p>定位：${positioning}</p>
          <p>亮点：${highlights}</p>`
        if (site.citations?.length) {
          const cite = document.createElement("p")
          cite.innerHTML = `引用：<a href="${site.citations[0]}" target="_blank" rel="noreferrer">${site.citations[0]}</a>`
          card.appendChild(cite)
        }
        list.appendChild(card)
      })
    section.appendChild(list)
    fragment.appendChild(section)
  }

  if (Array.isArray(summary.actionItems) && summary.actionItems.length) {
    const section = document.createElement("div")
    section.className = "summary-section"
    const title = document.createElement("h4")
    title.textContent = "行动项"
    section.appendChild(title)
    const list = document.createElement("ul")
    summary.actionItems
      .slice(0, options.compact ? 2 : summary.actionItems.length)
      .forEach((item) => {
        const li = document.createElement("li")
        li.textContent = `${item.title || "事项"}（优先级：${
          item.priority || "N/A"
        }） - ${item.detail || ""}`
        list.appendChild(li)
      })
    section.appendChild(list)
    fragment.appendChild(section)
  }

  if (
    Array.isArray(summary.questionCoverage) &&
    summary.questionCoverage.length &&
    !options.compact
  ) {
    const section = document.createElement("div")
    section.className = "summary-section"
    const title = document.createElement("h4")
    title.textContent = "问题覆盖"
    section.appendChild(title)
    const list = document.createElement("ul")
    summary.questionCoverage.slice(0, 5).forEach((item) => {
      const li = document.createElement("li")
      li.textContent = `${item.stepId}: 关键字命中率 ${
        typeof item.keywordHitRate === "number"
          ? Math.round(item.keywordHitRate * 100)
          : "—"
      }% · Top：${formatSummaryList(item.topSites)}`
      list.appendChild(li)
    })
    section.appendChild(list)
    fragment.appendChild(section)
  }

  return fragment
}

function formatSummaryList(rawValue) {
  if (!Array.isArray(rawValue) || rawValue.length === 0) {
    return "—"
  }
  return rawValue.join("、")
}

function extractResumeSummary(detail) {
  const runs = Array.isArray(detail?.runs) ? detail.runs : []
  for (const run of runs) {
    if (run.scenarioId !== RESUME_SCENE_ID) continue
    const steps = run?.result?.steps ?? []
    const summaryStep = steps.find((step) => step.stepId === RESUME_SUMMARY_STEP_ID)
    if (!summaryStep) {
      continue
    }
    return {
      structured: summaryStep.metadata?.resumeImpactSummary,
      raw:
        summaryStep.metadata?.resumeImpactSummaryRaw ||
        summaryStep.responseText ||
        "",
    }
  }
  return null
}

function computeKeywordAggregate(detail) {
  const stats = {
    expected: 0,
    hits: 0,
    mentionsZhijian: false,
  }
  const runs = Array.isArray(detail?.runs) ? detail.runs : []
  runs.forEach((run) => {
    run?.result?.steps?.forEach((step) => {
      const summary = step.metadata?.keywordSummary
      if (Array.isArray(summary?.expected)) {
        stats.expected += summary.expected.length
      }
      if (Array.isArray(summary?.hits)) {
        stats.hits += summary.hits.length
        if (
          summary.hits.some((hit) => hit && hit.includes("智简"))
        ) {
          stats.mentionsZhijian = true
        }
      }
      if (!stats.mentionsZhijian && step.responseText) {
        stats.mentionsZhijian = step.responseText.includes("智简")
      }
    })
  })
  return stats
}

function renderAggregateStats(stats) {
  const container = document.createElement("div")
  container.className = "aggregate-stats"

  const hitRate =
    stats.expected > 0
      ? `${Math.round((stats.hits / stats.expected) * 100)}%`
      : "—"

  const totalCard = document.createElement("div")
  totalCard.className = "aggregate-stat"
  totalCard.innerHTML = `<h4>关键词命中</h4><p>${stats.hits}/${stats.expected}（${hitRate}）</p>`

  const zhijianCard = document.createElement("div")
  zhijianCard.className = "aggregate-stat"
  zhijianCard.innerHTML = `<h4>提及“智简”</h4><p>${
    stats.mentionsZhijian ? "是" : "否"
  }</p>`

  container.appendChild(totalCard)
  container.appendChild(zhijianCard)
  return container
}

async function ensureQuestions() {
  if (resumeQuestions.length) return
  try {
    const response = await fetch(`${QUESTIONS_PATH}?t=${Date.now()}`)
    if (!response.ok) {
      throw new Error("failed to load resume questions")
    }
    const data = await response.json()
    if (Array.isArray(data)) {
      resumeQuestions = data
    }
  } catch (error) {
    console.warn("加载问题列表失败", error)
    resumeQuestions = []
  }
}

function renderEntries() {
  const limitedEntries = limitEntriesByDays(entries, 3)
  if (!limitedEntries.length) {
    setStatus("暂无运行记录。")
    return
  }

  const filtered = limitedEntries.filter((entry) => {
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

function renderDailyQuestionList(detail) {
  const container = document.createElement("div")
  container.className = "summary-keywords"
  const runs = Array.isArray(detail?.runs) ? detail.runs : []
  const entries = []

  runs.forEach((run) => {
    run?.result?.steps?.forEach((step) => {
      if (!step.stepId) return
      entries.push({
        stepId: step.stepId,
        status: step.status,
        response: step.responseText || "",
      })
    })
  })

  if (!entries.length || !resumeQuestions.length) {
    return container
  }

  const list = document.createElement("ul")
  list.className = "question-list"

  resumeQuestions.forEach((question) => {
    const data = entries.find((item) => item.stepId === question.id)
    const li = document.createElement("li")
    li.innerHTML = `<div class="question-title">${question.prompt}</div>
      <div class="question-answer">${data?.response || "（暂无回答）"}</div>`
    list.appendChild(li)
  })

  container.innerHTML = `<h4>今日回答（全部问题）</h4>`
  container.appendChild(list)
  return container
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

function limitEntriesByDays(list, days) {
  if (!Array.isArray(list) || list.length === 0) return []
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  )
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const filtered = sorted.filter((entry) => {
    if (!entry.createdAt) return false
    const created = new Date(entry.createdAt)
    return created >= cutoff
  })
  if (!filtered.length) {
    return sorted.slice(0, 3)
  }
  return filtered.slice(0, 3)
}
