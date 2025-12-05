import React from "react";

const App: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">LedgerAI Dev Shell</h1>
        <p className="text-muted-foreground">
          This Vite shell powers the preview environment. Your main app continues to run with its
          existing routing and backend.
        </p>
      </div>
    </div>
  );
};

export default App;
