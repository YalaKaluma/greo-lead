@router.post("/")
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(
        user_number=task.user_number,
        title=task.title,
        notes=task.notes,
        due_date=task.due_date
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/")
def get_tasks(user_number: str, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.user_number == user_number).order_by(Task.created_at).all()

@router.patch("/{task_id}")
def update_task(task_id: int, updates: TaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(404, "Task not found")
    if updates.title: db_task.title = updates.title
    if updates.status: db_task.status = updates.status
    if updates.notes: db_task.notes = updates.notes
    db.commit()
    return db_task


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db.query(Task).filter(Task.id == task_id).delete()
    db.commit()
    return {"status": "deleted"}
