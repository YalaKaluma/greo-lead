import { expect, test } from '@playwright/test';

const TEST_USER = 'e2e-user';

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function installApi(page) {
  let tasks = [];
  let nextTaskId = 1;

  await page.addInitScript((userNumber) => {
    localStorage.setItem('user_number', userNumber);
    localStorage.setItem('language', 'en');
  }, TEST_USER);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method();

    if (path === '/api/auth/me') {
      return json(route, {
        user: {
          phone_number: TEST_USER,
          name: 'E2E User',
          onboarding_completed: true,
          is_admin: false,
        },
      });
    }

    if (path === '/api/home/dashboard') {
      return json(route, {
        payload: {
          activation_ready: true,
          top_tasks: [],
          procrastinated_tasks: [],
          recommendations: [],
          goal_reviews: [],
          journey: {},
          metrics: {},
        },
      });
    }

    if (path === '/api/tasks' && method === 'GET') return json(route, tasks);
    if (path === '/api/tasks' && method === 'POST') {
      const input = request.postDataJSON();
      const task = {
        id: nextTaskId++,
        status: 'open',
        priority: 'medium',
        ...input,
      };
      tasks = [...tasks, task];
      return json(route, task, 201);
    }

    const toggleMatch = path.match(/^\/api\/tasks\/(\d+)\/toggle$/);
    if (toggleMatch && method === 'PATCH') {
      const id = Number(toggleMatch[1]);
      tasks = tasks.map((task) => task.id === id ? { ...task, status: 'completed' } : task);
      return json(route, tasks.find((task) => task.id === id));
    }

    if (path === '/api/tasks/filters') return json(route, { delegates: [] });
    if (path === '/api/tasks/mtn-trends') {
      return json(route, {
        summary: {
          today: { mtn_score: 0, completed_tasks: 0 },
          last_7_days: { average_score: 0, completed_tasks: 0 },
          last_90_days: { average_score: 0, completed_tasks: 0 },
        },
        daily_history: [],
        procrastinated_tasks: [],
      });
    }
    if (path === '/api/tasks/mtn-history') return json(route, { days: [] });
    if (path === '/api/journey/goals') return json(route, []);

    if (path.includes('/counts')) return json(route, {});
    if (path.includes('/intro-state')) return json(route, { show_intro_cards: false });
    if (path.includes('/preferences')) return json(route, {});
    if (path.includes('/profile')) return json(route, {});
    if (method === 'GET') return json(route, []);
    return json(route, {});
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test('frequently used pages load without a browser crash', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Executive Operating System' })).toBeVisible();

  const pages = [
    ['My Vision & Goals', 'My Vision and Goals'],
    ['My Projects', 'My Projects'],
    ['My Tasks', 'Your To-Do List'],
    ['My Development', 'Leadership Operating System'],
    ['My Habits', 'My Executive Habits'],
    ['My Team', 'My Leadership Ecosystem'],
    ['My Meetings', 'Meetings'],
    ['My Growth Journal', 'My Growth Journal'],
    ['Settings', 'Settings'],
  ];

  for (const [navigationLabel, heading] of pages) {
    await page.getByRole('button', { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }

  expect(browserErrors).toEqual([]);
});

test('a user can create and complete a task', async ({ page }) => {
  await page.goto('/?page=todo-list');
  await expect(page.getByRole('heading', { name: 'Your To-Do List' })).toBeVisible();

  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByPlaceholder('What needs to be done?').fill('E2E deployment task');
  await page.getByRole('button', { name: 'Add Task', exact: true }).last().click();

  await expect(page.getByText('E2E deployment task', { exact: true })).toBeVisible();
  const completionRequest = page.waitForRequest((request) => (
    request.method() === 'PATCH' && request.url().endsWith('/api/tasks/1/toggle')
  ));
  await page.getByTitle(/Click to complete/).click();
  await completionRequest;
  await expect(page.getByText('E2E deployment task', { exact: true })).toBeHidden({ timeout: 3_000 });
});
