VOICE AI AGENT
===============

An AI-powered voice agent that allows users to talk with an AI assistant using their voice.

The current version is built for a dental clinic use case. The agent can book and cancel appointments through a natural voice conversation.


WHAT DOES THIS PROJECT DO?
==========================

Instead of typing everything on a website, the user can simply talk to the AI agent.

Example:

User: I want to book an appointment.

Agent: Sure. May I know your name?

User: Agam Tyagi.

Agent: What treatment would you like?

User: Braces.

...

Agent: Your appointment is confirmed.
       Your Booking ID is CD-482731.


HOW IT WORKS
============

User speaks
     |
     v
Speech-to-Text
     |
     v
AI Agent
     |
     v
Understand the request
     |
     v
Perform required action
     |
     v
Generate response
     |
     v
Text-to-Speech
     |
     v
Agent speaks


CURRENT FEATURES
=================

- Voice-based AI conversation
- Speech-to-Text
- Text-to-Speech
- AI-powered conversation
- Appointment booking
- Doctor selection
- Treatment selection
- Appointment availability checking
- Unique Booking ID
- Booking confirmation email
- Appointment cancellation using Booking ID
- Cancellation confirmation
- Separate cancellation records
- Cancellation email
- MongoDB database
- Duplicate booking protection


TECHNOLOGIES USED
=================

Frontend:
- React
- Vite
- JavaScript

Backend:
- Node.js
- Express.js

AI:
- Groq
- LangGraph

Voice & AI:
- Google Gemini Live API
- Gemini Live Audio
- Real-time Speech-to-Text
- Real-time Text-to-Speec

Database:
- MongoDB
- Mongoose

Email:
- Nodemailer
- Gmail SMTP


PROJECT STRUCTURE
=================

voice-ai-agent/
|
|-- frontend/
|   |-- src/
|   |-- package.json
|   `-- ...
|
|-- backend/
|   |-- src/
|   |-- package.json
|   `-- ...
|
|-- .env.example
|-- .gitignore
`-- README.md


REQUIREMENTS
============

Before running the project, install these on your computer:

1. Node.js
2. npm
3. MongoDB
4. Git

You will also need API keys for the services used by the project.


HOW TO DOWNLOAD THE PROJECT
===========================

OPTION 1 - USING GIT
--------------------

Open Terminal or Git Bash and run:

git clone YOUR_GITHUB_REPOSITORY_URL

Then enter the project folder:

cd voice-ai-agent


OPTION 2 - DOWNLOAD ZIP
-----------------------

You can also download the project directly from GitHub.

GitHub Repository
       |
       v
Click "Code"
       |
       v
Click "Download ZIP"
       |
       v
Extract the ZIP file
       |
       v
Open the project folder


INSTALL DEPENDENCIES
====================

The project has two parts:

frontend
backend

Both have their own dependencies.


INSTALL FRONTEND DEPENDENCIES
-----------------------------

Open a terminal inside the project folder:

cd frontend

Then run:

npm install


INSTALL BACKEND DEPENDENCIES
----------------------------

Open another terminal:

cd backend

Then run:

npm install


ENVIRONMENT VARIABLES
=====================

The project requires API keys and database configuration.

Inside the backend folder, create a file named:

.env

Add:

GROQ_API_KEY=

MONGODB_URI=

DEEPGRAM_API_KEY=

ELEVENLABS_API_KEY=

EMAIL_USER=
EMAIL_APP_PASSWORD=


Example:

GROQ_API_KEY=your_groq_api_key
MONGODB_URI=your_mongodb_connection_string
DEEPGRAM_API_KEY=your_deepgram_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_email_app_password


IMPORTANT SECURITY NOTE
=======================

Never upload your real .env file to GitHub.

Your .gitignore should contain:

node_modules/
.env
.env.*
!.env.example

dist/
build/

*.log
.DS_Store

Only .env.example should be uploaded to GitHub.

Do not share your real API keys publicly.


MONGODB SETUP
=============

The project uses MongoDB to store appointment information.

You can use:

- Local MongoDB
- MongoDB Atlas

After creating your database, add the MongoDB connection string to:

MONGODB_URI=

Example:

MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/voice-ai-agent


HOW TO RUN THE PROJECT
======================

You need to run both the backend and frontend.


STEP 1 - START BACKEND
----------------------

Open Terminal 1.

Go to the backend folder:

cd voice-ai-agent/backend

Then run:

npm run dev

The backend server will start.


STEP 2 - START FRONTEND
-----------------------

Open Terminal 2.

Go to the frontend folder:

cd voice-ai-agent/frontend

Then run:

npm run dev

Vite will show a local URL, usually:

http://localhost:5173

Open this URL in your browser.


HOW TO USE THE VOICE AGENT
==========================

After opening the frontend in your browser:

1. Allow microphone permission.
2. Start the voice interaction.
3. Speak normally with the agent.
4. The agent converts your voice into text.
5. The AI understands your request.
6. The required action is performed.
7. The agent speaks the response back.


EXAMPLE - BOOK AN APPOINTMENT
=============================

Say:

"I want to book an appointment."

The agent will collect the required information step by step:

Name
  |
  v
Treatment
  |
  v
Doctor
  |
  v
Date
  |
  v
Time
  |
  v
Email
  |
  v
Confirmation

After successful booking, the system generates a unique Booking ID.

Example:

CD-482731

The Booking ID is also sent in the booking confirmation email.


EXAMPLE - CANCEL AN APPOINTMENT
================================

Say:

"I want to cancel my appointment."

The agent will ask for your Booking ID.

Example:

CD-482731

The cancellation flow is:

Booking ID
     |
     v
Find appointment
     |
     v
Show appointment details
     |
     v
Confirm appointment
     |
     v
Ask cancellation reason
     |
     v
Final confirmation
     |
     v
Cancel appointment
     |
     v
Save cancellation record
     |
     v
Send cancellation email

After cancellation, the appointment status changes from:

booked

to:

cancelled

The cancelled time slot can then become available again.


DUPLICATE BOOKING PROTECTION
============================

The system does not depend only on the AI to prevent duplicate appointments.

The database also checks:

Doctor + Date + Time

Two active appointments cannot be created for the same doctor at the same date and time.

This makes the booking system more reliable.


BOOKING ID
==========

Every appointment receives a unique Booking ID.

Example:

CD-482731

The Booking ID is:

- Stored in MongoDB
- Sent in the booking confirmation email
- Used to identify the appointment
- Used for appointment cancellation


DATABASE STRUCTURE
==================

APPOINTMENT
-----------

Appointment
|
|-- bookingId
|-- patientName
|-- patientEmail
|-- doctorName
|-- treatment
|-- date
|-- time
`-- status

Appointment status can be:

- booked
- cancelled
- completed


CANCELLATION
------------

Cancellation
|
|-- bookingId
|-- patientName
|-- patientEmail
|-- doctorName
|-- treatment
|-- date
|-- time
|-- reason
`-- cancelledAt


AGENT ARCHITECTURE
==================

The project uses an AI agent architecture where the AI understands the user's request and works with application/business logic.

User
 |
 v
Voice Input
 |
 v
Speech-to-Text
 |
 v
AI Agent
 |
 v
Business Logic / Tools
 |
 v
MongoDB
 |
 v
AI Response
 |
 v
Text-to-Speech
 |
 v
User

The architecture is designed so that new capabilities can be added later without rebuilding the complete project.


FUTURE IMPROVEMENTS
===================

The project is currently under development.

Planned improvements include:

- Better Speech-to-Text accuracy
- Better handling of names and emails
- Appointment rescheduling
- More voice commands
- Agent orchestration
- Multiple specialized agents
- MCP-based tools
- Memory
- Analytics
- Human handoff
- Better error handling
- Production deployment
- Support for multiple industries


PROJECT STATUS
==============

CURRENTLY UNDER ACTIVE DEVELOPMENT

The current version includes:

- Voice interaction
- Appointment booking
- Appointment cancellation
- Unique Booking ID
- MongoDB integration
- Booking confirmation email
- Cancellation email

More features will be added step by step.


AUTHOR
======

Agam Tyagi

GenAI Developer | Full Stack Developer 