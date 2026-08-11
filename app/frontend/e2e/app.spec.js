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
  let habits = [];
  let nextHabitId = 1;
  let meeting = null;
  let nextMessageId = 1;

  const meetingActions = [
    {
      id: 101,
      description: 'Prepare the quarterly budget',
      owner_name: 'E2E User',
      due_date: null,
      confidence: 0.95,
      evidence_excerpt: 'I will prepare the quarterly budget by Friday.',
      ignored: false,
      created_task_id: null,
    },
    {
      id: 102,
      description: 'Send the customer follow-up',
      owner_name: 'E2E User',
      due_date: null,
      confidence: 0.9,
      evidence_excerpt: 'I will send the customer follow-up tomorrow.',
      ignored: false,
      created_task_id: null,
    },
  ];

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

    if (path === '/api/habits' && method === 'GET') return json(route, habits);
    if (path === '/api/habits' && method === 'POST') {
      const input = request.postDataJSON();
      const habit = {
        id: nextHabitId++,
        today_status: 'pending',
        streak: 0,
        is_starter_example: false,
        ...input,
      };
      habits = [...habits, habit];
      return json(route, habit, 201);
    }

    const habitToggleMatch = path.match(/^\/api\/habits\/(\d+)\/toggle_today$/);
    if (habitToggleMatch && method === 'POST') {
      const id = Number(habitToggleMatch[1]);
      habits = habits.map((habit) => (
        habit.id === id ? { ...habit, today_status: 'done', streak: 1 } : habit
      ));
      return json(route, habits.find((habit) => habit.id === id));
    }

    if (path === '/api/chat/history') return json(route, { messages: [] });
    if (path === '/api/chat' && method === 'POST') {
      const input = request.postDataJSON();
      return json(route, {
        user_message_id: nextMessageId++,
        message_id: nextMessageId++,
        reply: `Reflection saved: ${input.message}`,
        timestamp: new Date().toISOString(),
        user_reflection_depth_score: 3,
        user_reflection_depth_level: 2,
        user_reflection_depth_label: 'Meaning making',
        user_reflection_depth_explanation: 'The reflection connects events to a leadership lesson.',
        user_reflection_depth_recommendations: [],
      });
    }

    if (path === '/api/meetings/notes' && method === 'POST') {
      const input = request.postDataJSON();
      meeting = {
        id: 1,
        title: input.title || 'Meeting notes',
        user_notes: input.notes,
        transcript_text: input.notes,
        started_at: new Date().toISOString(),
        one_line_summary: 'Budget planning and customer follow-up.',
        executive_summary: 'The team agreed on two clear follow-up actions.',
        status: 'processed',
        processing_status: 'ready',
        participants: [],
        topics: [],
        decisions: [],
        action_items: meetingActions,
        related_goals: [],
        related_projects: [],
        context_notes: [],
        leadership_domain_assessments: [],
        leadership_observations: [],
        has_recording: false,
      };
      return json(route, { id: meeting.id }, 202);
    }

    if (path === '/api/meetings' && method === 'GET') {
      const items = meeting ? [{
        ...meeting,
        action_item_count: meetingActions.length,
        decision_count: 0,
      }] : [];
      return json(route, { items, total: items.length, total_pages: 1 });
    }

    if (path === '/api/meetings/1' && method === 'GET') return json(route, meeting);
    if (path === '/api/meetings/context/options' && method === 'GET') {
      return json(route, { current_user: { title: 'E2E User' }, people: [], goals: [], projects: [] });
    }
    if (path === '/api/meetings/action-items/tasks' && method === 'GET') {
      return json(route, meetingActions
        .filter((action) => !action.ignored && !action.created_task_id)
        .map((action) => ({
          ...action,
          meeting_id: 1,
          meeting_title: meeting?.title || 'Quarterly planning',
          priority: 'medium',
          mtn_score: 0.8,
        })));
    }
    if (path === '/api/meetings/action-items/tasks/prepare' && method === 'POST') {
      return json(route, { prepared: true });
    }

    const meetingActionMatch = path.match(/^\/api\/meetings\/action-items\/(\d+)$/);
    if (meetingActionMatch && method === 'PATCH') {
      const id = Number(meetingActionMatch[1]);
      const action = meetingActions.find((item) => item.id === id);
      Object.assign(action, request.postDataJSON());
      return json(route, action);
    }

    const meetingTaskMatch = path.match(/^\/api\/meetings\/action-items\/(\d+)\/task$/);
    if (meetingTaskMatch && method === 'POST') {
      const action = meetingActions.find((item) => item.id === Number(meetingTaskMatch[1]));
      const task = {
        id: nextTaskId++,
        title: action.description,
        status: 'open',
        priority: 'medium',
        due_date: new Date().toISOString().slice(0, 10),
        notes: `Created from meeting: ${meeting?.title}`,
      };
      tasks = [...tasks, task];
      action.created_task_id = task.id;
      return json(route, { task_id: task.id }, 201);
    }

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
  await expect(page.getByRole('main').getByRole('heading', { name: 'My Executive Operating System' })).toBeVisible();

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

test('a user can create and complete a habit', async ({ page }) => {
  await page.goto('/?page=my-habits');
  await expect(page.getByRole('heading', { name: 'My Executive Habits' })).toBeVisible();

  await page.getByRole('button', { name: /Add Habit/ }).click();
  await page.getByPlaceholder('Habit title').fill('Review tomorrow priorities');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const habitTitle = page.getByText('Review tomorrow priorities', { exact: true });
  await expect(habitTitle).toBeVisible();
  const habitCard = habitTitle.locator('xpath=../..');
  const habitRequest = page.waitForRequest((request) => (
    request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/habits/1/toggle_today')
  ));
  await habitCard.getByRole('button').nth(1).click();
  await habitRequest;
  await expect(page.getByText('1-day', { exact: false })).toBeVisible();
});

test('a user can save a journal reflection and receive confirmation', async ({ page }) => {
  const reflection = 'I delegated the decision and gave the team clearer ownership.';
  await page.goto('/?page=my-journal');
  await expect(page.getByRole('heading', { name: 'My Growth Journal' })).toBeVisible();

  const journalRequest = page.waitForRequest((request) => (
    request.method() === 'POST' && request.url().endsWith('/api/chat')
  ));
  const journalForm = page.getByRole('main').locator('form');
  await journalForm.locator('textarea').fill(reflection);
  await journalForm.getByRole('button', { name: 'Send', exact: true }).click();
  const request = await journalRequest;

  expect(request.postDataJSON()).toMatchObject({
    message: reflection,
    conversation_type: 'journal',
  });
  await expect(page.getByText(reflection, { exact: true })).toBeVisible();
  await expect(page.getByText(`Reflection saved: ${reflection}`, { exact: true })).toBeVisible();
});

test('meeting transcript actions can be ignored or added to My Tasks', async ({ page }) => {
  const transcript = [
    'We reviewed the quarterly plan.',
    'I will prepare the quarterly budget by Friday.',
    'I will send the customer follow-up tomorrow.',
  ].join(' ');

  await page.goto('/?page=meetings');
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Meeting', exact: true }).click();
  await page.getByRole('button', { name: /Write Meeting Notes/ }).click();
  await page.getByPlaceholder('Weekly leadership meeting').fill('Quarterly planning');
  await page.getByPlaceholder(/Paste the meeting notes here/).fill(transcript);
  await page.getByRole('button', { name: 'Process Meeting Notes' }).click();

  await expect(page.getByText('Prepare the quarterly budget', { exact: true })).toBeVisible();
  await expect(page.getByText('Send the customer follow-up', { exact: true })).toBeVisible();
  await expect(page.getByText(transcript, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /All meetings/ }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();

  const ignoredAction = page.getByText('Prepare the quarterly budget', { exact: true });
  const ignoredCard = ignoredAction.locator('xpath=../..');
  await ignoredCard.getByRole('button', { name: 'Ignore', exact: true }).click();
  await expect(ignoredAction).toBeHidden();

  const addedAction = page.getByText('Send the customer follow-up', { exact: true });
  const addedCard = addedAction.locator('xpath=../..');
  await addedCard.getByRole('button', { name: 'Add to List', exact: true }).click();
  await expect(addedAction).toBeHidden();

  await page.getByRole('button', { name: 'My Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your To-Do List' })).toBeVisible();
  await expect(page.getByText('Send the customer follow-up', { exact: true })).toBeVisible();
});
