import express from "express";

const app = express();

// Lets Express read JSON request bodies, such as {"email": "..."}
app.use(express.json());

// A simple route to confirm the server is running
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Lost and Found API is running",
  });
});

// Handles any URL that no route matched
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;