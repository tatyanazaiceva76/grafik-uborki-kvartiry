export const DAYS = Object.freeze([
  Object.freeze({ id: 'mon', label: 'Понедельник' }),
  Object.freeze({ id: 'tue', label: 'Вторник' }),
  Object.freeze({ id: 'wed', label: 'Среда' }),
  Object.freeze({ id: 'thu', label: 'Четверг' }),
  Object.freeze({ id: 'fri', label: 'Пятница' }),
  Object.freeze({ id: 'sat', label: 'Суббота' }),
  Object.freeze({ id: 'sun', label: 'Воскресенье' })
]);

const DAY_IDS = new Set(DAYS.map(({ id }) => id));
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const textLength = (value) => Array.from(value).length;
const cleanText = (value) => typeof value === 'string' ? value.normalize('NFKC').trim() : '';
const labelKey = (value) => cleanText(value).toLocaleLowerCase('ru-RU');

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name}: ожидается массив.`);
  return value;
}

function requireId(value, path) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TypeError(`${path}: некорректный устойчивый ID.`);
  }
  return value;
}

export function validatePlannerInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Нужны данные взрослых и задач.');
  }
  const adultsRaw = requireArray(raw.adults, 'Взрослые');
  const tasksRaw = requireArray(raw.tasks, 'Задачи');
  if (adultsRaw.length < 1 || adultsRaw.length > 8) throw new RangeError('Нужно от 1 до 8 взрослых.');
  if (tasksRaw.length < 1 || tasksRaw.length > 100) throw new RangeError('Нужно от 1 до 100 задач.');

  const adultIds = new Set();
  const adultKeys = new Set();
  const adults = adultsRaw.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(`Взрослый ${index + 1}: некорректная запись.`);
    const id = requireId(source.id, `Взрослый ${index + 1}`);
    if (adultIds.has(id)) throw new TypeError(`Взрослый ${index + 1}: ID повторяется.`);
    adultIds.add(id);
    const label = cleanText(source.label);
    if (!label || textLength(label) > 60) throw new RangeError(`Взрослый ${index + 1}: псевдоним должен содержать 1–60 символов.`);
    const key = labelKey(label);
    if (adultKeys.has(key)) throw new TypeError(`Псевдоним «${label}» повторяется после нормализации.`);
    adultKeys.add(key);
    const availability = requireArray(source.availableDays, `Доступность «${label}»`);
    const availableDays = [];
    const seenDays = new Set();
    for (const day of availability) {
      if (!DAY_IDS.has(day)) throw new TypeError(`Доступность «${label}»: неизвестный день.`);
      if (seenDays.has(day)) throw new TypeError(`Доступность «${label}»: день повторяется.`);
      seenDays.add(day);
      availableDays.push(day);
    }
    return Object.freeze({ id, label, availableDays: Object.freeze(availableDays), order: index });
  });

  const taskIds = new Set();
  let totalMinutes = 0;
  const tasks = tasksRaw.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(`Задача ${index + 1}: некорректная запись.`);
    const id = requireId(source.id, `Задача ${index + 1}`);
    if (taskIds.has(id)) throw new TypeError(`Задача ${index + 1}: ID повторяется.`);
    taskIds.add(id);
    const label = cleanText(source.label);
    if (!label || textLength(label) > 120) throw new RangeError(`Задача ${index + 1}: название должно содержать 1–120 символов.`);
    if (!DAY_IDS.has(source.day)) throw new TypeError(`Задача «${label}»: выберите день недели.`);
    const minutes = Number(source.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) throw new RangeError(`Задача «${label}»: минуты должны быть целым числом от 1 до 480.`);
    totalMinutes += minutes;
    const preferredAdultId = source.preferredAdultId === null || source.preferredAdultId === '' || source.preferredAdultId === undefined
      ? null
      : requireId(source.preferredAdultId, `Задача «${label}», выбранный взрослый`);
    return Object.freeze({ id, label, day: source.day, minutes, preferredAdultId, order: index });
  });
  if (totalMinutes > 10000) throw new RangeError('Суммарно разрешено не более 10 000 минут в неделю.');
  return Object.freeze({ adults: Object.freeze(adults), tasks: Object.freeze(tasks), totalMinutes });
}

export function createPlan(raw) {
  const validated = validatePlannerInput(raw);
  const adultById = new Map(validated.adults.map((adult) => [adult.id, adult]));
  const weekly = new Map(validated.adults.map((adult) => [adult.id, 0]));
  const daily = new Map(validated.adults.map((adult) => [adult.id, new Map(DAYS.map(({ id }) => [id, 0]))]));
  const assignments = [];
  const unassigned = [];

  const assign = (task, adult) => {
    weekly.set(adult.id, weekly.get(adult.id) + task.minutes);
    daily.get(adult.id).set(task.day, daily.get(adult.id).get(task.day) + task.minutes);
    assignments.push(Object.freeze({ taskId: task.id, taskLabel: task.label, day: task.day, minutes: task.minutes, adultId: adult.id, adultLabel: adult.label }));
  };
  const hold = (task, reason) => unassigned.push(Object.freeze({ taskId: task.id, taskLabel: task.label, day: task.day, minutes: task.minutes, preferredAdultId: task.preferredAdultId, reason }));

  for (const task of validated.tasks) {
    if (task.preferredAdultId === null) continue;
    const adult = adultById.get(task.preferredAdultId);
    if (!adult) hold(task, 'PREFERRED_ADULT_MISSING');
    else if (!adult.availableDays.includes(task.day)) hold(task, 'PREFERRED_ADULT_UNAVAILABLE');
    else assign(task, adult);
  }
  for (const task of validated.tasks) {
    if (task.preferredAdultId !== null) continue;
    const eligible = validated.adults.filter((adult) => adult.availableDays.includes(task.day));
    if (eligible.length === 0) {
      hold(task, 'NO_ADULT_AVAILABLE');
      continue;
    }
    eligible.sort((left, right) => weekly.get(left.id) - weekly.get(right.id) || left.order - right.order);
    assign(task, eligible[0]);
  }

  assignments.sort((left, right) => validated.tasks.findIndex(({ id }) => id === left.taskId) - validated.tasks.findIndex(({ id }) => id === right.taskId));
  unassigned.sort((left, right) => validated.tasks.findIndex(({ id }) => id === left.taskId) - validated.tasks.findIndex(({ id }) => id === right.taskId));
  const board = DAYS.map((day) => Object.freeze({
    id: day.id,
    label: day.label,
    tasks: Object.freeze(assignments.filter((item) => item.day === day.id))
  }));
  const personTotals = validated.adults.map((adult) => Object.freeze({
    adultId: adult.id,
    adultLabel: adult.label,
    byDay: Object.freeze(Object.fromEntries(DAYS.map(({ id }) => [id, daily.get(adult.id).get(id)]))),
    week: weekly.get(adult.id)
  }));
  const assignedMinutes = assignments.reduce((sum, item) => sum + item.minutes, 0);
  const unassignedMinutes = unassigned.reduce((sum, item) => sum + item.minutes, 0);
  if (assignedMinutes + unassignedMinutes !== validated.totalMinutes) throw new Error('Нарушена сохранность минут.');
  return Object.freeze({
    rule: 'PREFERRED_THEN_LOWEST_WEEKLY_MINUTES_STABLE_ORDER',
    inputMinutes: validated.totalMinutes,
    assignedMinutes,
    unassignedMinutes,
    board: Object.freeze(board),
    personTotals: Object.freeze(personTotals),
    unassigned: Object.freeze(unassigned)
  });
}
