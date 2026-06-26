#!/bin/bash

# Agent Dashboard Startup Script
# Starts both backend and frontend servers

set -e  # Exit on any error

echo "Starting Agent Dashboard..."

# Check if we're in the right directory
if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
  echo "Error: Please run this script from the project root directory"
  exit 1
fi

# Function to handle script termination
cleanup() {
  echo "Shutting down servers..."
  # Kill backend process if it exists
  if [ ! -z "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
  fi
  # Kill frontend process if it exists
  if [ ! -z "$FRONTEND_PID" ]; then
    kill $FRONTEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
  fi
  echo "Servers shut down."
  exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend server..."
cd backend
npm install > /dev/null 2>&1  # Install dependencies if needed
npm start &
BACKEND_PID=$!
cd ..

# Give backend a moment to start
sleep 2

# Start frontend
echo "Starting frontend server..."
cd frontend
npm install > /dev/null 2>&1  # Install dependencies if needed
npm start &
FRONTEND_PID=$!
cd ..

echo "Backend running on http://localhost:3001 (PID: $BACKEND_PID)"
echo "Frontend running on http://localhost:3000 (PID: $FRONTEND_PID)"
echo "Application should be accessible at http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for both processes
wait $BACKEND_PID
wait $FRONTEND_PID