import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config()

const webhookUrl = process.env.WEBHOOK_URL; 
const messageContent = 'Hello from Node.js!';

async function sendDiscordMessage(content) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
        username: 'Notification Bot',
        // avatar_url: 'YOUR_AVATAR_URL',
      }),
    });

    if (!response.ok) {
      console.error(`Error sending message: ${response.status} ${response.statusText}`);
    } else {
      console.log('Message sent successfully!');
    }
  } catch (error) {
    console.error('Error sending Discord message:', error);
  }
}

sendDiscordMessage(messageContent);