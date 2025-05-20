require("dotenv").config(); // Load environment variables from .env
const express = require("express");
const multer = require("multer"); // For handling file uploads
const cors = require("cors"); // To allow cross-origin requests from frontend
const msRest = require("@azure/ms-rest-js"); // This statement imports the whole toolbox from msRest
const {
  PredictionAPIClient,
} = require("@azure/cognitiveservices-customvision-prediction"); // This imports it directly so I don't have to use the dot notation

// MIDDLEWARES
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 4000;

// MULTER
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// AZURE CREDENTIALS
const predictionKey = process.env.AZURE_CV_PREDICTION_KEY;
const predictionEndpoint = process.env.AZURE_CV_PREDICTION_ENDPOINT;
const projectId = process.env.AZURE_CV_PROJECT_ID;
const iterationId = process.env.AZURE_CV_ITERATION_ID;

// CREDENTIALS CHECK
if (!predictionKey || !predictionEndpoint || !projectId || !iterationId) {
  console.error(
    "FATAL ERROR: Azure Custom Vision credentials not set in .env file!"
  );
  process.exit(1); // Exit the process if credentials are missing
}

// INITIALIZE msRest toolbox and PredictionAPIClient.
const credentials = new msRest.ApiKeyCredentials({
  inHeader: { "Prediction-key": predictionKey },
}); // This is dot notation
const predictor = new PredictionAPIClient(credentials, predictionEndpoint); // This is the direct import

// ENDPOINT to handle form submission and file upload
app.post("/api/upload", upload.single("vehicleImage"), async (req, res) => {
  try {
    // --- FRONTEND BUSINESS LOGIC ---
    const { name, email, number, vehicleType } = req.body; // Variables to access from the frontend
    const imageFile = req.file; // Image file from the frontend

    // VALIDATE FORM DATA
    if (!imageFile) {
      return res.status(400).json({ error: "No image file uploaded." });
    }

    // --- SENDING IMAGE TO AZURE ---
    const results = await predictor.classifyImage(
      projectId,
      iterationId,
      imageFile.buffer
    ); // Used buffer to send the image data to Azure

    // --- BACKEND BUSINESS LOGIC ---
    let predictionSummary = "No clear prediction"; // Variable to store the prediction summary
    let topTagName = null; // Will store the tag name if prediction is confident
    let basePriceValue = "Could not determine base price."; // Initialize base price value

    // CHECK PREDICTION RESULTS
    if (results && results.predictions && results.predictions.length > 0) {
      const sortedPredictions = results.predictions.sort(
        (a, b) => b.probability - a.probability
      );

      // GET TOP PREDICTION
      const topPrediction = sortedPredictions[0];
      const topTagProbability = topPrediction.probability; // Still get probability internally for threshold

      if (topTagProbability > 0.4) { // If prediction is confident @ 40%
        topTagName = topPrediction.tagName; // Store the tag name
        predictionSummary = topTagName; // Set summary to just the tag name

        // Conditionally determine base price based on topTagName over 40%
        const predictionTagLower = topTagName.toLowerCase(); // Convert to lower case for comparison
        if (predictionTagLower.includes("trucks")) {
          basePriceValue = "$160 monthly";
        } else if (predictionTagLower.includes("suv")) {
          basePriceValue = "$130 monthly";
        } else if (predictionTagLower.includes("sedan")) {
          basePriceValue = "$110 monthly";
        } else if (predictionTagLower.includes("write")) {
          basePriceValue = "Excess is as negotiated, Please contact our support team.";
        }

        // Now, format the 'basePrice' directly before sending
        if (topTagName && basePriceValue !== "Could not determine base price.") {
          basePrice = ` Base price for ${topTagName} = ${basePriceValue}`;
        } else {
          basePrice = basePriceValue; // Fallback if no specific tag is found or it's "Write off"
        }

      } else {
        // HANDLE UNCERTAIN PREDICTIONS UNDER 40%
        predictionSummary = "Uncertain prediction";
        basePrice = "Prediction confidence too low to determine base price.";
      }
    } else {
      console.warn("Custom Vision returned no predictions.");
      predictionSummary = "No prediction results"; // Handle no predictions case
      basePrice = "No prediction results to determine base price.";
    }

    // --- END BACKEND BUSINESS LOGIC ---

    // RESPONSE BACK TO FRONTEND
    res.status(200).json({
      message: "Form and image received, Custom Vision processed.",
      formData: { name, email, number, vehicleType },
      predictionSummary: predictionSummary,
      topTagName: topTagName, 
      basePrice: basePrice, 
    });
  } catch (error) {
    console.error("Error processing upload:", error);
    res
      .status(500)
      .json({
        error: "An error occurred during processing.",
        details: error.message,
      });
  }
});

// Basic root route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// START SERVER
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});