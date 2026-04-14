/* Expense Tracker (Vanilla JS + LocalStorage)
   - No backend/database
   - Chart.js via CDN
   - SPA-style navigation (Dashboard / Add / Reports)
*/

(() => {
  "use strict";

  const STORAGE_KEY = "expenseTracker.expenses.v1";
  const CATEGORIES = ["Food", "Travel", "Shopping", "Bills", "Others"];

  // ---- DOM ----
  const els = {
    // Navigation / layout
    navItems: Array.from(document.querySelectorAll(".nav-item")),
    views: Array.from(document.querySelectorAll(".view")),
    pageTitle: document.getElementById("pageTitle"),
    pageSubtitle: document.getElementById("pageSubtitle"),
    expenseCountPill: document.getElementById("expenseCountPill"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    sidebar: document.querySelector(".sidebar"),

    // Loading + toast
    loadingOverlay: document.getElementById("loadingOverlay"),
    toastContainer: document.getElementById("toastContainer"),

    // Dashboard
    metricTotal: document.getElementById("metricTotal"),
    metricToday: document.getElementById("metricToday"),
    metricMonth: document.getElementById("metricMonth"),
    metricMonthHint: document.getElementById("metricMonthHint"),
    recentList: document.getElementById("recentList"),
    recentEmpty: document.getElementById("recentEmpty"),
    dashboardDonutCanvas: document.getElementById("dashboardDonut"),
    dashboardChartEmpty: document.getElementById("dashboardChartEmpty"),
    goAddFromDashboard: document.getElementById("goAddFromDashboard"),

    // Add expense
    formTitle: document.getElementById("formTitle"),
    expenseForm: document.getElementById("expenseForm"),
    expenseId: document.getElementById("expenseId"),
    amount: document.getElementById("amount"),
    category: document.getElementById("category"),
    date: document.getElementById("date"),
    notes: document.getElementById("notes"),
    saveBtn: document.getElementById("saveBtn"),
    resetBtn: document.getElementById("resetBtn"),

    // Reports filters + table + charts
    filterCategory: document.getElementById("filterCategory"),
    filterMonth: document.getElementById("filterMonth"),
    filterFrom: document.getElementById("filterFrom"),
    filterTo: document.getElementById("filterTo"),
    applyFiltersBtn: document.getElementById("applyFiltersBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),

    expensesTbody: document.getElementById("expensesTbody"),
    tableWrap: document.getElementById("tableWrap"),
    tableEmpty: document.getElementById("tableEmpty"),

    monthlyTotalPill: document.getElementById("monthlyTotalPill"),
    reportsMonthLabel: document.getElementById("reportsMonthLabel"),
    reportsBarCanvas: document.getElementById("reportsBar"),
    reportsBarEmpty: document.getElementById("reportsBarEmpty"),
    reportsDonutCanvas: document.getElementById("reportsDonut"),
    reportsDonutEmpty: document.getElementById("reportsDonutEmpty"),
    categorySummaryList: document.getElementById("categorySummaryList"),

    // Footer actions
    exportBtn: document.getElementById("exportBtn"),
    clearAllBtn: document.getElementById("clearAllBtn"),
  };

  // ---- State ----
  let expenses = [];
  let activeRoute = "dashboard";
  let dashboardDonutChart = null;
  let reportsDonutChart = null;
  let reportsBarChart = null;

  // ---- Utilities ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showLoading(ms = 450) {
    els.loadingOverlay.classList.add("is-visible");
    els.loadingOverlay.setAttribute("aria-hidden", "false");
    return sleep(ms).finally(() => {
      els.loadingOverlay.classList.remove("is-visible");
      els.loadingOverlay.setAttribute("aria-hidden", "true");
    });
  }

  // Reusable currency formatter (Indian Rupees + Indian numbering)
  function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(num);
  }

  function formatDateDisplay(isoDate) {
    // isoDate: yyyy-mm-dd
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-").map((x) => Number(x));
    if (!y || !m || !d) return isoDate;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function todayIso() {
    const dt = new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function monthKeyFromIso(isoDate) {
    // yyyy-mm-dd -> yyyy-mm
    return isoDate ? isoDate.slice(0, 7) : "";
  }

  function safeParseJson(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function uid() {
    // Avoid ultra-long UUIDs; keep it readable
    return `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---- Toasts ----
  function toast(type, title, message, ttl = 3000) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    const iconChar = type === "success" ? "✓" : type === "error" ? "!" : "i";
    t.innerHTML = `
      <div class="toast-icon">${iconChar}</div>
      <div>
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-msg">${escapeHtml(message)}</div>
      </div>
    `;
    els.toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-6px)";
      t.style.transition = "opacity .2s ease, transform .2s ease";
      setTimeout(() => t.remove(), 250);
    }, ttl);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---- Storage ----
  function loadExpenses() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParseJson(raw, []);
    if (!Array.isArray(parsed)) return [];

    // Validate shape minimally; skip invalid entries
    return parsed
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        id: String(e.id || uid()),
        amount: Number(e.amount) || 0,
        category: CATEGORIES.includes(e.category) ? e.category : "Others",
        date: typeof e.date === "string" ? e.date : todayIso(),
        notes: typeof e.notes === "string" ? e.notes : "",
        createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
      }))
      .filter((e) => e.amount > 0);
  }

  function saveExpenses() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }

  // ---- Navigation ----
  const ROUTE_META = {
    dashboard: { title: "Dashboard", subtitle: "Overview of your spending" },
    add: { title: "Add Expense", subtitle: "Add a new transaction" },
    reports: { title: "Reports", subtitle: "Filters, list, and analytics" },
  };

  function setRoute(route) {
    activeRoute = route;
    els.navItems.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.route === route));
    els.views.forEach((v) => v.classList.toggle("is-active", v.dataset.view === route));

    const meta = ROUTE_META[route] || ROUTE_META.dashboard;
    els.pageTitle.textContent = meta.title;
    els.pageSubtitle.textContent = meta.subtitle;

    // Close mobile sidebar when navigating
    els.sidebar.classList.remove("is-open");
  }

  // ---- Validation ----
  function clearValidation() {
    [els.amount, els.category, els.date].forEach((el) => el.classList.remove("is-invalid"));
  }

  function validateForm() {
    clearValidation();
    const amount = Number(els.amount.value);
    const category = els.category.value;
    const date = els.date.value;

    let ok = true;
    if (!Number.isFinite(amount) || amount <= 0) {
      els.amount.classList.add("is-invalid");
      ok = false;
    }
    if (!CATEGORIES.includes(category)) {
      els.category.classList.add("is-invalid");
      ok = false;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      els.date.classList.add("is-invalid");
      ok = false;
    }
    return ok;
  }

  // ---- Filtering ----
  function getActiveFilters() {
    return {
      category: els.filterCategory.value || "",
      month: els.filterMonth.value || "", // yyyy-mm
      from: els.filterFrom.value || "", // yyyy-mm-dd
      to: els.filterTo.value || "",
    };
  }

  function applyFilters(list, filters) {
    return list.filter((e) => {
      if (filters.category && e.category !== filters.category) return false;

      if (filters.month) {
        const mk = monthKeyFromIso(e.date);
        if (mk !== filters.month) return false;
      }

      if (filters.from && e.date < filters.from) return false;
      if (filters.to && e.date > filters.to) return false;

      return true;
    });
  }

  // ---- Rendering ----
  function updateCountsPill() {
    els.expenseCountPill.textContent = `${expenses.length} expense${expenses.length === 1 ? "" : "s"}`;
  }

  function computeTotals() {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const today = todayIso();
    const month = monthKeyFromIso(today);
    const todayTotal = expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
    const monthTotal = expenses.filter((e) => monthKeyFromIso(e.date) === month).reduce((sum, e) => sum + e.amount, 0);
    return { total, todayTotal, monthTotal, month };
  }

  function renderDashboard() {
    const { total, todayTotal, monthTotal, month } = computeTotals();
    els.metricTotal.textContent = formatCurrency(total);
    els.metricToday.textContent = formatCurrency(todayTotal);
    els.metricMonth.textContent = formatCurrency(monthTotal);

    const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
    els.metricMonthHint.textContent = monthName;

    // Recent 5
    const sorted = [...expenses].sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt - a.createdAt));
    const recent = sorted.slice(0, 5);
    if (recent.length === 0) {
      els.recentEmpty.hidden = false;
      els.recentList.hidden = true;
      els.recentList.innerHTML = "";
    } else {
      els.recentEmpty.hidden = true;
      els.recentList.hidden = false;
      els.recentList.innerHTML = recent
        .map(
          (e) => `
        <div class="recent-item">
          <div class="recent-left">
            <div class="recent-icon" title="${escapeHtml(e.category)}">${escapeHtml(e.category[0] || "E")}</div>
            <div class="recent-meta">
              <div class="recent-title">${escapeHtml(e.category)} • ${escapeHtml(formatDateDisplay(e.date))}</div>
              <div class="recent-sub">${escapeHtml(e.notes || "—")}</div>
            </div>
          </div>
          <div class="recent-amount">${escapeHtml(formatCurrency(e.amount))}</div>
        </div>
      `,
        )
        .join("");
    }

    // Donut: current month category breakdown
    const monthItems = expenses.filter((e) => monthKeyFromIso(e.date) === month);
    const breakdown = summarizeByCategory(monthItems);
    const hasData = breakdown.total > 0;

    els.dashboardChartEmpty.hidden = hasData;
    els.dashboardDonutCanvas.parentElement.hidden = !hasData;

    if (hasData) {
      dashboardDonutChart = renderDonut(
        dashboardDonutChart,
        els.dashboardDonutCanvas,
        breakdown.labels,
        breakdown.values,
      );
    } else {
      if (dashboardDonutChart) {
        dashboardDonutChart.destroy();
        dashboardDonutChart = null;
      }
    }
  }

  function renderReports() {
    const filters = getActiveFilters();
    const filtered = applyFilters(expenses, filters);

    renderTable(filtered);
    renderReportsAnalytics(filtered, filters);
  }

  function renderTable(list) {
    if (list.length === 0) {
      els.tableEmpty.hidden = false;
      els.tableWrap.hidden = true;
      els.expensesTbody.innerHTML = "";
      return;
    }
    els.tableEmpty.hidden = true;
    els.tableWrap.hidden = false;

    const sorted = [...list].sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt - a.createdAt));
    els.expensesTbody.innerHTML = sorted
      .map((e) => {
        const notes = e.notes?.trim() ? escapeHtml(e.notes.trim()) : "—";
        return `
          <tr data-id="${escapeHtml(e.id)}">
            <td>${escapeHtml(formatDateDisplay(e.date))}</td>
            <td><span class="badge">${escapeHtml(e.category)}</span></td>
            <td class="right">${escapeHtml(formatCurrency(e.amount))}</td>
            <td>${notes}</td>
            <td class="right">
              <div class="row-actions">
                <button class="mini-btn" data-action="edit" type="button">Edit</button>
                <button class="mini-btn danger" data-action="delete" type="button">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // ---- Analytics (Chart.js) ----
  function chartPalette(n) {
    const base = [
      "#4F46E5", // primary
      "#22C55E", // secondary
      "#F97316",
      "#06B6D4",
      "#A855F7",
      "#F59E0B",
      "#EF4444",
      "#10B981",
      "#3B82F6",
      "#8B5CF6",
    ];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  function summarizeByCategory(list) {
    const map = new Map(CATEGORIES.map((c) => [c, 0]));
    for (const e of list) {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    }
    const labels = [];
    const values = [];
    let total = 0;
    for (const c of CATEGORIES) {
      const v = map.get(c) || 0;
      if (v > 0) {
        labels.push(c);
        values.push(Number(v.toFixed(2)));
        total += v;
      }
    }
    return { labels, values, total };
  }

  function summarizeByDay(list, month) {
    // For selected month, make a day-by-day bar.
    if (!month) return { labels: [], values: [] };
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const totals = Array.from({ length: daysInMonth }, () => 0);
    for (const e of list) {
      if (monthKeyFromIso(e.date) !== month) continue;
      const day = Number(e.date.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) totals[day - 1] += e.amount;
    }
    const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const values = totals.map((v) => Number(v.toFixed(2)));
    return { labels, values };
  }

  function renderDonut(existingChart, canvas, labels, values) {
    const colors = chartPalette(labels.length);
    if (existingChart) existingChart.destroy();
    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
        cutout: "62%",
      },
    });
  }

  function renderBar(existingChart, canvas, labels, values) {
    if (existingChart) existingChart.destroy();
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Daily total",
            data: values,
            backgroundColor: "rgba(79,70,229,0.20)",
            borderColor: "rgba(79,70,229,0.65)",
            borderWidth: 1,
            borderRadius: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (v) => formatCurrency(v),
            },
            grid: { color: "rgba(148,163,184,0.25)" },
          },
          x: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
      },
    });
  }

  function renderReportsAnalytics(filtered, filters) {
    // Monthly total: based on selected month, otherwise current month
    const month = filters.month || monthKeyFromIso(todayIso());
    const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
    els.reportsMonthLabel.textContent = monthLabel;

    const monthTotal = filtered
      .filter((e) => monthKeyFromIso(e.date) === month)
      .reduce((sum, e) => sum + e.amount, 0);
    els.monthlyTotalPill.textContent = formatCurrency(monthTotal);

    // Bar: daily totals for month from the filtered list
    const daySummary = summarizeByDay(filtered, month);
    const hasBarData = daySummary.values.some((v) => v > 0);
    els.reportsBarEmpty.hidden = hasBarData;
    els.reportsBarCanvas.parentElement.hidden = !hasBarData;

    if (hasBarData) {
      reportsBarChart = renderBar(reportsBarChart, els.reportsBarCanvas, daySummary.labels, daySummary.values);
    } else {
      if (reportsBarChart) {
        reportsBarChart.destroy();
        reportsBarChart = null;
      }
    }

    // Donut + list: category summary (based on current filters)
    const cat = summarizeByCategory(filtered);
    const hasDonut = cat.total > 0;
    els.reportsDonutEmpty.hidden = hasDonut;
    els.reportsDonutCanvas.parentElement.hidden = !hasDonut;
    els.categorySummaryList.innerHTML = "";

    if (hasDonut) {
      reportsDonutChart = renderDonut(reportsDonutChart, els.reportsDonutCanvas, cat.labels, cat.values);
      renderSummaryList(cat.labels, cat.values);
    } else {
      if (reportsDonutChart) {
        reportsDonutChart.destroy();
        reportsDonutChart = null;
      }
    }
  }

  function renderSummaryList(labels, values) {
    const colors = chartPalette(labels.length);
    const rows = labels.map((lab, i) => {
      return `
        <div class="summary-row">
          <div class="summary-left">
            <span class="swatch" style="background:${colors[i]}"></span>
            <span class="summary-cat">${escapeHtml(lab)}</span>
          </div>
          <div class="summary-val">${escapeHtml(formatCurrency(values[i]))}</div>
        </div>
      `;
    });
    els.categorySummaryList.innerHTML = rows.join("");
  }

  // ---- CRUD ----
  function upsertExpense(payload) {
    const idx = expenses.findIndex((e) => e.id === payload.id);
    if (idx >= 0) {
      expenses[idx] = { ...expenses[idx], ...payload };
      return "updated";
    }
    expenses.push(payload);
    return "created";
  }

  function deleteExpense(id) {
    const before = expenses.length;
    expenses = expenses.filter((e) => e.id !== id);
    return expenses.length !== before;
  }

  function resetForm() {
    els.expenseId.value = "";
    els.amount.value = "";
    els.category.value = "";
    els.date.value = todayIso();
    els.notes.value = "";
    els.formTitle.textContent = "Add Expense";
    els.saveBtn.textContent = "Save Expense";
    clearValidation();
  }

  function loadExpenseIntoForm(id) {
    const e = expenses.find((x) => x.id === id);
    if (!e) return false;
    els.expenseId.value = e.id;
    els.amount.value = String(e.amount);
    els.category.value = e.category;
    els.date.value = e.date;
    els.notes.value = e.notes || "";
    els.formTitle.textContent = "Edit Expense";
    els.saveBtn.textContent = "Update Expense";
    clearValidation();
    return true;
  }

  // ---- Export / Clear ----
  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Event handlers ----
  function wireEvents() {
    // Nav
    els.navItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.dataset.route;
        setRoute(route);
        if (route === "dashboard") renderDashboard();
        if (route === "reports") renderReports();
        if (route === "add") {
          // Keep current edit state, but ensure date default if empty
          if (!els.date.value) els.date.value = todayIso();
        }
      });
    });

    // Mobile menu
    els.mobileMenuBtn.addEventListener("click", () => {
      els.sidebar.classList.toggle("is-open");
    });

    // Dashboard "Add" shortcut
    els.goAddFromDashboard.addEventListener("click", () => {
      setRoute("add");
      resetForm();
    });

    // Form submit
    els.expenseForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!validateForm()) {
        toast("error", "Fix required fields", "Please provide a valid amount, category, and date.");
        return;
      }

      const isEdit = Boolean(els.expenseId.value);
      const payload = {
        id: els.expenseId.value || uid(),
        amount: Number(els.amount.value),
        category: els.category.value,
        date: els.date.value,
        notes: (els.notes.value || "").trim(),
        createdAt: isEdit ? (expenses.find((e) => e.id === els.expenseId.value)?.createdAt ?? Date.now()) : Date.now(),
      };

      await showLoading();

      const result = upsertExpense(payload);
      saveExpenses();
      updateCountsPill();

      renderDashboard();
      renderReports();

      toast("success", result === "created" ? "Expense saved" : "Expense updated", "Your expense has been stored locally.");
      resetForm();
      setRoute("dashboard");
    });

    // Reset button
    els.resetBtn.addEventListener("click", () => {
      resetForm();
      toast("info", "Form cleared", "You can add a new expense now.");
    });

    // Reports: apply/clear filters
    els.applyFiltersBtn.addEventListener("click", async () => {
      // Light validation: if both set, ensure from <= to
      const from = els.filterFrom.value;
      const to = els.filterTo.value;
      if (from && to && from > to) {
        toast("error", "Invalid date range", "From date must be earlier than To date.");
        return;
      }
      await showLoading(250);
      renderReports();
      toast("success", "Filters applied", "Showing filtered expenses.");
    });

    els.clearFiltersBtn.addEventListener("click", async () => {
      els.filterCategory.value = "";
      els.filterMonth.value = "";
      els.filterFrom.value = "";
      els.filterTo.value = "";
      await showLoading(200);
      renderReports();
      toast("info", "Filters cleared", "Showing all expenses.");
    });

    // Table actions (event delegation)
    els.expensesTbody.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const tr = btn.closest("tr[data-id]");
      const id = tr?.dataset?.id;
      if (!id) return;

      const action = btn.dataset.action;
      if (action === "edit") {
        const ok = loadExpenseIntoForm(id);
        if (!ok) {
          toast("error", "Not found", "That expense no longer exists.");
          return;
        }
        setRoute("add");
        toast("info", "Edit mode", "Update the fields and click Update Expense.");
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("Delete this expense? This cannot be undone.");
        if (!confirmDelete) return;
        await showLoading(250);
        const ok = deleteExpense(id);
        if (!ok) {
          toast("error", "Not found", "That expense no longer exists.");
          return;
        }
        saveExpenses();
        updateCountsPill();
        renderDashboard();
        renderReports();
        toast("success", "Deleted", "Expense removed.");
      }
    });

    // Export
    els.exportBtn.addEventListener("click", () => {
      if (expenses.length === 0) {
        toast("info", "Nothing to export", "Add expenses first.");
        return;
      }
      const filename = `expenses_${todayIso()}.json`;
      downloadJson(filename, expenses);
      toast("success", "Export started", `Downloaded ${filename}.`);
    });

    // Clear all
    els.clearAllBtn.addEventListener("click", async () => {
      if (expenses.length === 0) {
        toast("info", "Already empty", "No expenses to clear.");
        return;
      }
      const ok = window.confirm("Clear ALL expenses? This cannot be undone.");
      if (!ok) return;
      await showLoading(400);
      expenses = [];
      saveExpenses();
      updateCountsPill();
      renderDashboard();
      renderReports();
      resetForm();
      toast("success", "Cleared", "All expenses removed.");
    });
  }

  // ---- Init ----
  function initDefaults() {
    // Default date = today
    els.date.value = todayIso();

    // Default month filter = current month
    els.filterMonth.value = monthKeyFromIso(todayIso());
  }

  function initialRender() {
    updateCountsPill();
    renderDashboard();
    renderReports();
    setRoute("dashboard");
  }

  function boot() {
    expenses = loadExpenses();
    initDefaults();
    wireEvents();
    initialRender();

    // Small welcome toast if first time
    if (expenses.length === 0) {
      toast("info", "Welcome", "Your data stays in this browser using LocalStorage.", 3800);
    }
  }

  // Ensure Chart.js is loaded
  window.addEventListener("DOMContentLoaded", () => {
    if (typeof Chart === "undefined") {
      toast("error", "Chart.js failed to load", "Check your internet connection (CDN).");
      return;
    }
    boot();
  });
})();

