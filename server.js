require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const multer = require('multer'); // For handling file uploads
const cors = require('cors'); // To allow cross-origin requests from frontend
const msRest = require('@azure/ms-rest-js'); // This statement imports the whole toolbox from msRest
const { PredictionAPIClient } = require('@azure/cognitiveservices-customvision-prediction'); // This imports it directly so I don't have to use the dot notation

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
  console.error("FATAL ERROR: Azure Custom Vision credentials not set in .env file!");
  process.exit(1); // Exit the process if credentials are missing
}

// INITIALIZE msRest toolbox and PredictionAPIClient.
const credentials = new msRest.ApiKeyCredentials({ inHeader: { 'Prediction-key': predictionKey } }); // This is dot notation
const predictor = new PredictionAPIClient(credentials, predictionEndpoint); // This is the direct import

// ENDPOINT to handle form submission and file upload
app.post('/api/upload', upload.single('vehicleImage'), async (req, res) => {
    try {
        // --- FRONTEND BUSINESS LOGIC ---
        const { name, email, number, vehicleType } = req.body; // Access form data from req.body
        const imageFile = req.file;

        if (!imageFile) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        console.log('Received form data:', { name, email, number, vehicleType });
        console.log('Received image:', imageFile.originalname);

        // --- Send image to Azure Custom Vision ---
        console.log('Sending image to Azure Custom Vision...');
        const results = await predictor.classifyImage(projectId, iterationId, imageFile.buffer);
        console.log('Azure Custom Vision results:', results); // Still log full results on backend for debugging

        // --- BACKEND BUSINESS LOGIC ---

        let predictionSummary = 'No clear prediction'; // Variable to store the prediction summary
        let topTagName = null; // Will store the tag name if prediction is confident

        if (results && results.predictions && results.predictions.length > 0) {
            // Sort predictions by probability descending
            const sortedPredictions = results.predictions.sort((a, b) => b.probability - a.probability);

            // Get the top prediction
            const topPrediction = sortedPredictions[0];
            const topTagProbability = topPrediction.probability; // Still get probability internally for threshold


            if (topTagProbability > 0.4) {
                topTagName = topPrediction.tagName; // Store the tag name
                predictionSummary = topTagName; // Set summary to just the tag name

                console.log(`Confident prediction: ${topTagName} (${(topTagProbability * 100).toFixed(1)}%)`);

            } else {
                // Handle uncertain predictions
                predictionSummary = 'Uncertain prediction'; // uncertain message
                console.log(`Prediction confidence below threshold (top tag: ${topPrediction.tagName}, confidence: ${(topTagProbability * 100).toFixed(1)}%)`);
                
            }
        } else {
             console.warn("Custom Vision returned no predictions.");
             predictionSummary = 'No prediction results'; // Handle no predictions case
        }

        // --- END BACKEND BUSINESS LOGIC ---
        
        // Send a response back to the frontend
        res.status(200).json({
            message: 'Form and image received, Custom Vision processed.',
            formData: { name, email, number, vehicleType },
            // customVisionResults: results, 
            predictionSummary: predictionSummary, 
            topTagName: topTagName // Send the raw tag name 
        });

    } catch (error) {
        console.error('Error processing upload:', error);
        // ... (detailed error logging) ...
        res.status(500).json({ error: 'An error occurred during processing.', details: error.message });
    }
});

// Basic root route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Start server
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});