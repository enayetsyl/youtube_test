// server.js
const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const User = require('./models/User'); 
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs')

const app = express();
const port = process.env.PORT || 3001;

const corsOptions = {
  origin: 'http://localhost:5173',  // Allow only this origin to access
  optionsSuccessStatus: 200     // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Connect to MongoDB
mongoose.connect('mongodb+srv://youtube_post:7T1v6Yp0C41aokNX@cluster0.ktgpsav.mongodb.net/youtube_test?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


app.use(bodyParser.json());
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
}));

// Configure OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  '1084926580778-s30h9vo5hvq7f5bn26uuujp7e2s9b20v.apps.googleusercontent.com',
  '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',
  'http://localhost:3001/oauth2callback'
);

// Redirect user to Google's consent page
app.get('/auth/google', (req, res) => {
  console.log('auth route hit')

  const state = crypto.randomBytes(20).toString('hex');
  const nonce = crypto.randomBytes(20).toString('hex'); 

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload',
  'openid',
  'email'
  ],
  include_granted_scopes: true,
  state: state,
  nonce: nonce,
  response_type: 'code', 
  prompt: 'consent',
  });
  console.log('redirect url', url)
  res.redirect(url);
});

// Get authorization code from Google callback
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  console.log('code callback', code)
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('tokens', tokens)
    oauth2Client.setCredentials(tokens);

     // Decode the id_token
     const decoded = jwt.decode(tokens.id_token);
     console.log('decoded', decoded)

     const user = await User.findOne({ googleId: decoded.sub });
    // Store the tokens and user ID in the database
    if (user) {
      // Update existing user tokens or handle as needed
      user.accessToken = tokens.access_token;
      user.refreshToken = tokens.refresh_token;
      await user.save();
    } else {
      // Create new user if not exists
      const newUser = new User({
        googleId: decoded.sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email: decoded.email 
      });
      await newUser.save();
    }

    res.redirect(`http://localhost:5173?googleId=${decoded.sub}`); // Redirect back to the frontend
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

// Endpoint to upload video
app.post('/uploadVideo', async (req, res) => {
  const { userId } = req.body;
  
  const user = await User.findOne({ googleId: userId });
  if (!user) {
    return res.status(404).send('User not found');
  }

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });


  // Helper function to upload a video
  async function uploadVideo(filePath, title, description, delay) {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const response = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
              snippet: {
                title: title,
                description: description,
              },
              status: {
                privacyStatus: 'private',
              },
            },
            media: {
              body: fs.createReadStream(filePath),
            },
          });
          console.log(`Video uploaded with ID: ${response.data.id}`);
          resolve(response.data.id); // Resolve the promise with the video ID
        } catch (error) {
          console.error('Failed to upload video:', error);
          reject(error); // Reject the promise on error
        }
      }, delay);
    });
  }
  
  try {
    // Upload videos sequentially with a two-minute interval between each
    await uploadVideo('./test-1.mp4', 'Test Video 1', 'This is the first test video.', 0);
    await uploadVideo('./test-2.mp4', 'Test Video 2', 'This is the second test video.', 120000);
    await uploadVideo('./test-3.mp4', 'Test Video 3', 'This is the third test video.', 240000);
    res.send('All videos have been scheduled for upload.');
  } catch (error) {
    res.status(500).send('Failed to upload one or more videos.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
