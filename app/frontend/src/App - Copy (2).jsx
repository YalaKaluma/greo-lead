function App() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f3f4f6'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          🚀 Leadership OS
        </h1>
        <p style={{ fontSize: '1.5rem', color: '#6b7280' }}>
          Backend is running! Frontend connected successfully.
        </p>
        <p style={{ marginTop: '2rem', color: '#9ca3af' }}>
          React app is working!
        </p>
      </div>
    </div>
  );
}

export default App;