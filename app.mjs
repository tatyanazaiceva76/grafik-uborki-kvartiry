import { DAYS, createPlan } from './core.mjs';

const SHORT_DAYS = Object.freeze({ mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс' });
const allDays = () => DAYS.map(({ id }) => id);
const exampleState = () => ({
  nextAdult: 3,
  nextTask: 4,
  adults: [
    { id: 'adult-1', label: 'Взрослый 1', availableDays: allDays() },
    { id: 'adult-2', label: 'Взрослый 2', availableDays: allDays() }
  ],
  tasks: [
    { id: 'task-1', label: 'Протереть пыль', day: 'mon', minutes: '15', preferredAdultId: null },
    { id: 'task-2', label: 'Пропылесосить', day: 'wed', minutes: '25', preferredAdultId: null },
    { id: 'task-3', label: 'Вымыть пол', day: 'sat', minutes: '25', preferredAdultId: null }
  ]
});

let state = exampleState();
let currentPlan = null;
const form = document.querySelector('#planner-form');
const adultsHost = document.querySelector('#adults-list');
const tasksHost = document.querySelector('#tasks-list');
const errors = document.querySelector('#errors');
const result = document.querySelector('#result');
const printButton = document.querySelector('#print-plan');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const labelWrap = (text, control) => {
  const label = el('label', 'field');
  label.append(el('span', 'field-label', text), control);
  return label;
};

function invalidate() {
  currentPlan = null;
  result.hidden = true;
  result.replaceChildren();
  printButton.disabled = true;
  errors.textContent = '';
}

function renderAdults() {
  adultsHost.replaceChildren();
  for (const adult of state.adults) {
    const card = el('fieldset', 'editor-card');
    card.append(el('legend', '', adult.label || 'Взрослый'));
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 60; name.value = adult.label; name.autocomplete = 'off';
    name.addEventListener('input', () => { adult.label = name.value; card.querySelector('legend').textContent = name.value || 'Взрослый'; invalidate(); renderTasks(); });
    card.append(labelWrap('Псевдоним взрослого', name));
    const dayGroup = el('div', 'day-checks');
    dayGroup.setAttribute('aria-label', 'Доступные дни');
    for (const day of DAYS) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = adult.availableDays.includes(day.id); checkbox.setAttribute('aria-label', day.label);
      checkbox.addEventListener('change', () => {
        adult.availableDays = checkbox.checked ? [...adult.availableDays, day.id] : adult.availableDays.filter((id) => id !== day.id);
        invalidate();
      });
      const wrapper = el('label', 'check');
      wrapper.append(checkbox, document.createTextNode(SHORT_DAYS[day.id]));
      dayGroup.append(wrapper);
    }
    card.append(el('p', 'mini-label', 'Доступность (можно оставить пустой)'), dayGroup);
    const remove = el('button', 'secondary danger', 'Удалить взрослого');
    remove.type = 'button'; remove.disabled = state.adults.length === 1;
    remove.addEventListener('click', () => { state.adults = state.adults.filter(({ id }) => id !== adult.id); invalidate(); renderEditors(); });
    card.append(remove);
    adultsHost.append(card);
  }
}

function renderTasks() {
  tasksHost.replaceChildren();
  for (const task of state.tasks) {
    const card = el('fieldset', 'editor-card task-card');
    card.append(el('legend', '', task.label || 'Задача'));
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 120; name.value = task.label; name.autocomplete = 'off';
    name.addEventListener('input', () => { task.label = name.value; card.querySelector('legend').textContent = name.value || 'Задача'; invalidate(); });
    const day = document.createElement('select');
    for (const item of DAYS) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; option.selected = item.id === task.day; day.append(option); }
    day.addEventListener('change', () => { task.day = day.value; invalidate(); });
    const minutes = document.createElement('input');
    minutes.type = 'number'; minutes.min = '1'; minutes.max = '480'; minutes.step = '1'; minutes.inputMode = 'numeric'; minutes.value = task.minutes;
    minutes.addEventListener('input', () => { task.minutes = minutes.value; invalidate(); });
    const preferred = document.createElement('select');
    const any = document.createElement('option'); any.value = ''; any.textContent = 'Любой доступный взрослый'; preferred.append(any);
    const missing = task.preferredAdultId && !state.adults.some(({ id }) => id === task.preferredAdultId);
    if (missing) { const option = document.createElement('option'); option.value = task.preferredAdultId; option.textContent = 'Удалённый взрослый — оставить неназначенной'; option.selected = true; preferred.append(option); }
    for (const adult of state.adults) { const option = document.createElement('option'); option.value = adult.id; option.textContent = adult.label || 'Без псевдонима'; option.selected = adult.id === task.preferredAdultId; preferred.append(option); }
    preferred.addEventListener('change', () => { task.preferredAdultId = preferred.value || null; invalidate(); });
    const grid = el('div', 'task-grid');
    grid.append(labelWrap('Название', name), labelWrap('День', day), labelWrap('Минуты', minutes), labelWrap('Назначение', preferred));
    const remove = el('button', 'secondary danger', 'Удалить задачу'); remove.type = 'button'; remove.disabled = state.tasks.length === 1;
    remove.addEventListener('click', () => { state.tasks = state.tasks.filter(({ id }) => id !== task.id); invalidate(); renderTasks(); });
    card.append(grid, remove);
    tasksHost.append(card);
  }
}

function renderEditors() { renderAdults(); renderTasks(); }

function reasonText(reason) {
  return ({
    PREFERRED_ADULT_MISSING: 'выбранный взрослый удалён',
    PREFERRED_ADULT_UNAVAILABLE: 'выбранный взрослый недоступен в этот день',
    NO_ADULT_AVAILABLE: 'в этот день нет доступного взрослого'
  })[reason] || 'не назначено';
}

function renderPlan(plan) {
  result.replaceChildren();
  result.append(el('p', 'eyebrow', 'Актуальный результат'), el('h2', '', 'Недельная доска'));
  const assumptions = el('div', 'assumptions');
  assumptions.append(
    el('p', '', 'Это механическое распределение ваших данных: сначала явные назначения, затем задачи «любой взрослый» по наименьшей сумме недельных минут; при равенстве — порядок взрослых.'),
    el('p', '', 'Расчёт не гарантирует справедливость, оптимальность, выполнение или достаточный уровень уборки. Согласуйте задачи и оценки времени внутри хозяйства.'),
    el('p', '', 'Псевдонимы, задачи и минуты задаются в форме. Исходные строки — редактируемый пример для взрослых, а не рекомендации по частоте, химии или нормы гигиены.')
  );
  const summary = el('p', 'conservation', `Краткий итог: ${plan.assignedMinutes} мин назначено, ${plan.unassignedMinutes} мин осталось неназначенным, ${plan.inputMinutes} мин введено.`);
  result.append(summary);
  const board = el('div', 'board');
  for (const day of plan.board) {
    const card = el('section', 'day-card');
    card.append(el('h3', '', day.label));
    if (day.tasks.length === 0) card.append(el('p', 'empty', 'Назначенных задач нет.'));
    else {
      const list = el('ul', 'task-list');
      for (const item of day.tasks) list.append(el('li', '', `${item.taskLabel} — ${item.adultLabel}, ${item.minutes} мин`));
      card.append(list);
    }
    board.append(card);
  }
  result.append(board, assumptions, el('h2', '', 'Итоги по минутам'));
  const tableWrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const text of ['Взрослый', ...DAYS.map(({ id }) => SHORT_DAYS[id]), 'Неделя']) headerRow.append(el('th', '', text));
  head.append(headerRow); table.append(head);
  const body = document.createElement('tbody');
  for (const person of plan.personTotals) {
    const row = document.createElement('tr'); row.append(el('th', '', person.adultLabel));
    for (const day of DAYS) row.append(el('td', '', String(person.byDay[day.id])));
    row.append(el('td', '', String(person.week))); body.append(row);
  }
  table.append(body); tableWrap.append(table); result.append(tableWrap, el('h2', '', 'Неназначенные задачи'));
  if (plan.unassigned.length === 0) result.append(el('p', 'success', 'Все задачи назначены.'));
  else {
    const list = el('ul', 'unassigned');
    for (const item of plan.unassigned) list.append(el('li', '', `${item.taskLabel} — ${DAYS.find(({ id }) => id === item.day).label}, ${item.minutes} мин: ${reasonText(item.reason)}.`));
    result.append(list);
  }
  result.append(el('p', 'conservation', `Проверка полноты: ${plan.assignedMinutes} мин назначено + ${plan.unassignedMinutes} мин не назначено = ${plan.inputMinutes} мин введено.`));
  result.hidden = false; printButton.disabled = false;
}

document.querySelector('#add-adult').addEventListener('click', () => {
  if (state.adults.length >= 8) return;
  state.adults.push({ id: `adult-${state.nextAdult++}`, label: `Взрослый ${state.adults.length + 1}`, availableDays: allDays() });
  invalidate(); renderEditors();
});
document.querySelector('#add-task').addEventListener('click', () => {
  if (state.tasks.length >= 100) return;
  state.tasks.push({ id: `task-${state.nextTask++}`, label: '', day: 'mon', minutes: '15', preferredAdultId: null });
  invalidate(); renderTasks();
});
document.querySelector('#reset-plan').addEventListener('click', () => { state = exampleState(); invalidate(); renderEditors(); });
printButton.addEventListener('click', () => { if (currentPlan && !result.hidden) window.print(); });
form.addEventListener('submit', (event) => {
  event.preventDefault(); invalidate();
  try {
    currentPlan = createPlan(state);
    renderPlan(currentPlan);
  } catch (error) {
    errors.textContent = error instanceof Error ? error.message : 'Не удалось проверить данные.';
    errors.focus();
  }
});

renderEditors();
