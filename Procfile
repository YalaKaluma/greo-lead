web: cd app/frontend && npm install && npm run build && cd ../.. && DIRECT_DATABASE_URL= alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
