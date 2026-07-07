import "dotenv/config";
import app from "./app.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Setu base URL: ${process.env.SETU_BASE_URL || "https://dg-sandbox.setu.co"}`);
  if (!process.env.SETU_X_CLIENT_ID) {
    console.warn("⚠️  Setu credentials not configured. Add them to backend/.env");
    console.warn("   See backend/.env.example for the required variables.");
  }
});
