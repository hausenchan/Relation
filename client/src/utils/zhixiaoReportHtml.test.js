import { applyZhixiaoSelectedDate, extractZhixiaoDateMeta } from './zhixiaoReportHtml';

const NEW_REPORT_HTML = `<!doctype html><html><body>
  <div id="calendarPicker"><button class="calendar-trigger"><span id="calendarText">2026-08-03</span></button></div>
  <div class="day-report" data-date="2026-06-14">6月14日报告</div>
  <div class="day-report active" data-date="2026-08-03">8月3日报告</div>
  <script>
    window.AVAILABLE_DATES=["2026-06-14","2026-08-03"];
    function switchDate(value) {
      document.querySelectorAll('.day-report').forEach(function(panel) {
        panel.classList.toggle('active', panel.dataset.date === value);
      });
      document.getElementById('calendarText').textContent = value;
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
});

test('selecting a historical date also works after current-report script sanitization', () => {
  const sanitizedHtml = NEW_REPORT_HTML.replace(/<script>[\s\S]*?<\/script>/, '');
  document.open();
  document.write(applyZhixiaoSelectedDate(sanitizedHtml, '2026-06-14'));
  document.close();

  expect(document.getElementById('calendarText').textContent).toBe('2026-06-14');
  expect(document.querySelector('.day-report.active')?.dataset.date).toBe('2026-06-14');
});
