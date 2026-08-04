import { applyZhixiaoSelectedDate, extractZhixiaoDateMeta } from './zhixiaoReportHtml';

const NEW_REPORT_HTML = `<!doctype html><html><body>
  <nav class="page-side-nav">
    <button data-page="income">收入汇总</button>
    <button class="active" data-page="app">应用汇总</button>
    <button data-page="daily">每日分析</button>
    <button>订单汇总</button>
  </nav>
  <div id="incomeSummaryPage" style="display:none">收入汇总数据</div>
  <div id="dailyAnalysisPage" style="display:none">每日分析数据</div>
  <div id="calendarPicker"><button class="calendar-trigger"><span id="calendarText">2026-08-03</span></button></div>
  <div id="mainReportPage">
    <div class="day-report" data-date="2026-06-14">6月14日报告</div>
    <div class="day-report active" data-date="2026-08-03">8月3日报告</div>
  </div>
  <script>
    window.AVAILABLE_DATES=["2026-06-14","2026-08-03"];
    function switchDate(value) {
      document.querySelectorAll('.day-report').forEach(function(panel) {
        panel.classList.toggle('active', panel.dataset.date === value);
      });
      document.getElementById('calendarText').textContent = value;
    }
    function switchReportPage(page, button) {
      document.getElementById('mainReportPage').style.display = page === 'app' ? '' : 'none';
      document.getElementById('incomeSummaryPage').style.display = page === 'income' ? '' : 'none';
      document.getElementById('dailyAnalysisPage').style.display = page === 'daily' ? '' : 'none';
      document.querySelectorAll('.page-side-nav button').forEach(function(item) {
        item.classList.toggle('active', item === button);
      });
    }
  </script>
</body></html>`;

test('extracts dates from the current AVAILABLE_DATES report format', () => {
  expect(extractZhixiaoDateMeta(NEW_REPORT_HTML)).toEqual({
    dates: ['2026-06-14', '2026-08-03'],
    latest: '2026-08-03',
  });
});

test('selecting a historical date activates the matching current-format report panel', () => {
  document.open();
  document.write(applyZhixiaoSelectedDate(NEW_REPORT_HTML, '2026-06-14'));
  document.close();

  expect(document.getElementById('calendarText').textContent).toBe('2026-06-14');
  expect(document.querySelector('.day-report.active')?.dataset.date).toBe('2026-06-14');

  document.querySelector('[data-page="income"]').click();
  expect(document.getElementById('incomeSummaryPage').style.display).toBe('');
  expect(document.getElementById('mainReportPage').style.display).toBe('none');
});

test('selecting a historical date also works after current-report script sanitization', () => {
  const sanitizedHtml = NEW_REPORT_HTML.replace(/<script>[\s\S]*?<\/script>/, '');
  document.open();
  document.write(applyZhixiaoSelectedDate(sanitizedHtml, '2026-06-14'));
  document.close();

  expect(document.getElementById('calendarText').textContent).toBe('2026-06-14');
  expect(document.querySelector('.day-report.active')?.dataset.date).toBe('2026-06-14');

  document.querySelector('[data-page="daily"]').click();
  expect(document.getElementById('dailyAnalysisPage').style.display).toBe('');
  expect(document.getElementById('mainReportPage').style.display).toBe('none');
  expect(document.querySelector('[data-page="daily"]').classList.contains('active')).toBe(true);
});
