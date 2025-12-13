import React, { useState, useEffect } from 'react';
import { taskApi } from './services/api';
import TaskItem from './components/TaskItem';
import AddTaskForm from './components/AddTaskForm';

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('due_today');
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedDelegate, setSelectedDelegate] = useState(null);
  const [projects, setProjects] = useState([]);
  const [delegates, setDelegates] = useState([]);
  const [error, setError] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const params = { 
        filter: filter 
      };
      if (selectedProject) params.project = selectedProject;
      if (selectedDelegate) params.delegated_to = selectedDelegate;
      
      const response = await taskApi.getTasks(params);
      setTasks(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load tasks');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    try {
      const response = await taskApi.getFilters();
      setProjects(response.data.projects || []);
      setDelegates(response.data.delegates || []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [filter, selectedProject, selectedDelegate]);

  useEffect(() => {
    loadFilters();
  }, []);

  const handleAddTask = async (taskData) => {
    try {
      await taskApi.createTask(taskData);
      await loadTasks();
      await loadFilters();
      setShowAddForm(false);
    } catch (err) {
      setError('Failed to create task');
      console.error(err);
    }
  };

  const handleUpdateTask = async (id, taskData) => {
    try {
      await taskApi.updateTask(id, taskData);
      await loadTasks();
      await loadFilters();
    } catch (err) {
      setError('Failed to update task');
      console.error(err);
    }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    
    try {
      await taskApi.deleteTask(id);
      await loadTasks();
      await loadFilters();
    } catch (err) {
      setError('Failed to delete task');
      console.error(err);
    }
  };

  const handleToggleTask = async (id) => {
    try {
      await taskApi.toggleTask(id);
      await loadTasks();
    } catch (err) {
      setError('Failed to toggle task');
      console.error(err);
    }
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newTasks = [...tasks];
    const draggedTask = newTasks[draggedIndex];
    
    newTasks.splice(draggedIndex, 1);
    newTasks.splice(index, 0, draggedTask);
    
    setTasks(newTasks);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const clearFilters = () => {
    setSelectedProject(null);
    setSelectedDelegate(null);
    setFilter('due_today');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-800 text-white shadow-2xl flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold">Alfred's Executive O.S.</h1>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          {/* Date Filters */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Due Date
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => { setFilter('due_today'); setSelectedProject(null); setSelectedDelegate(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'due_today' && !selectedProject && !selectedDelegate
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                📅 Due Today
              </button>
              <button
                onClick={() => { setFilter('next_7_days'); setSelectedProject(null); setSelectedDelegate(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'next_7_days' && !selectedProject && !selectedDelegate
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                📆 Next 7 Days
              </button>
              <button
                onClick={() => { setFilter('all'); setSelectedProject(null); setSelectedDelegate(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all' && !selectedProject && !selectedDelegate
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                📋 All Tasks
              </button>
            </div>
          </div>

          {/* Project Filters */}
          {projects.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Projects
              </h3>
              <div className="space-y-1">
                {projects.map((project) => (
                  <button
                    key={project}
                    onClick={() => { setSelectedProject(project); setSelectedDelegate(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors truncate ${
                      selectedProject === project
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    title={project}
                  >
                    📁 {project}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delegate Filters */}
          {delegates.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Delegated To
              </h3>
              <div className="space-y-1">
                {delegates.map((delegate) => (
                  <button
                    key={delegate}
                    onClick={() => { setSelectedDelegate(delegate); setSelectedProject(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors truncate ${
                      selectedDelegate === delegate
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                    title={delegate}
                  >
                    👤 {delegate}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters */}
          {(selectedProject || selectedDelegate) && (
            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              ✕ Clear Filters
            </button>
          )}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header with Add Button */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-800">Your To-Do List</h2>
              <p className="text-slate-600 mt-1">
                {selectedProject && `Project: ${selectedProject}`}
                {selectedDelegate && `Delegated to: ${selectedDelegate}`}
                {!selectedProject && !selectedDelegate && (
                  <>
                    {filter === 'due_today' && 'Tasks due today'}
                    {filter === 'next_7_days' && 'Tasks due in the next 7 days'}
                    {filter === 'all' && 'All your tasks'}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              title="Add new task"
            >
              <span className="text-xl">+</span>
              <span>Add Task</span>
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Add Task Form (Collapsible & Compact) */}
          {showAddForm && (
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-800">Add New Task</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
              <AddTaskForm 
                onSubmit={handleAddTask} 
                projects={projects}
                delegates={delegates}
              />
            </div>
          )}

          {/* Tasks List */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-center text-slate-500 py-12">
                  No tasks found. {!showAddForm && 'Click + to add one!'}
                </p>
              ) : (
                <div className="space-y-1">
                  {tasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      taskNumber={index + 1}
                      onUpdate={handleUpdateTask}
                      onToggle={handleToggleTask}
                      onDelete={handleDeleteTask}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      isDragging={draggedIndex === index}
                      projects={projects}
                      delegates={delegates}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
