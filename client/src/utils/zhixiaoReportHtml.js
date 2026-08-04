function escapeScriptString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\u003c');
}

function parseDateArray(source, pattern) {
  const match = source.match(pattern);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed)
      ? parsed.map(String).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      : [];
  } catch {
    return [];
  }
}

export function extractZhixiaoDateMeta(html) {
  const source = String(html || '');
  let dates = parseDateArray(source, /"dates"\s*:\s*(\[[^\]]*\])/);
  if (!dates.length) {
    dates = parseDateArray(source, /(?:window\.)?AVAILABLE_DATES\s*=\s*(\[[^\]]*\])/);
  }
  if (!dates.length) {
    dates = Array.from(source.matchAll(/\bdata-date\s*=\s*(["'])(\d{4}-\d{2}-\d{2})\1/gi), match => match[2]);
  }
  dates = [...new Set(dates)].sort();

  const reportLatest = source.match(/"latest"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
  const activePanelDate = source.match(/\bclass\s*=\s*(["'])[^"']*\bday-report\b[^"']*\bactive\b[^"']*\1[^>]*\bdata-date\s*=\s*(["'])(\d{4}-\d{2}-\d{2})\2/i)?.[3]
    || source.match(/\bdata-date\s*=\s*(["'])(\d{4}-\d{2}-\d{2})\1[^>]*\bclass\s*=\s*(["'])[^"']*\bday-report\b[^"']*\bactive\b[^"']*\3/i)?.[2];
  const latest = reportLatest || activePanelDate || dates[dates.length - 1] || '';
  return {
    dates,
    latest: dates.includes(latest) ? latest : dates[dates.length - 1] || '',
  };
}

export function applyZhixiaoSelectedDate(html, selectedDate) {
  if (!selectedDate) return html;
  const safeDate = escapeScriptString(selectedDate);
  let output = String(html || '');
  output = output.replace(
    /\b(?:let|var|const)\s+currentDate\s*=\s*REPORT_DATA\.latest\s*;/,
    `let currentDate = "${safeDate}";`,
  );
  const syncScript = `<script data-relation-zhixiao-selected-date="${safeDate}">
(function(){
  function applySelectedDate(){
    try {
      var targetDate = "${safeDate}";
      var availableDates = Array.isArray(window.AVAILABLE_DATES)
        ? window.AVAILABLE_DATES
        : ((window.REPORT_DATA && Array.isArray(window.REPORT_DATA.dates)) ? window.REPORT_DATA.dates : []);
      var reportPanels = Array.prototype.slice.call(document.querySelectorAll(".day-report[data-date]"));
      if (!availableDates.length && reportPanels.length) {
        availableDates = reportPanels.map(function(panel){ return panel.dataset.date; });
      }
      if (availableDates.indexOf(targetDate) < 0) return;
      if (typeof switchDate === "function") {
        try { calendarMonth = targetDate.slice(0, 7); } catch (error) {}
        if (typeof renderCalendar === "function") renderCalendar(targetDate.slice(0, 7), false);
        switchDate(targetDate);
        if (typeof closeCalendar === "function") closeCalendar();
        return;
      }
      if (reportPanels.length) {
        reportPanels.forEach(function(panel){ panel.classList.toggle("active", panel.dataset.date === targetDate); });
        var calendarText = document.getElementById("calendarText");
        if (calendarText) calendarText.textContent = targetDate;
        document.querySelectorAll(".calendar-day[data-date]").forEach(function(button){
          button.classList.toggle("active", button.dataset.date === targetDate);
        });
        return;
      }
      var select = document.getElementById("dateSelect");
      if (select) select.value = targetDate;
      try { currentDate = targetDate; } catch (error) { window.currentDate = targetDate; }
      try { if (typeof activeApp !== "undefined") activeApp = null; } catch (error) {}
      if (typeof renderAll === "function") renderAll();
    } catch (error) {
      console.error("Relation 支小日报指定日期失败", error);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applySelectedDate, { once: true });
  else applySelectedDate();
})();
</script>`;
  if (/<\/body\s*>/i.test(output)) return output.replace(/<\/body\s*>/i, `${syncScript}</body>`);
  return `${output}${syncScript}`;
}
