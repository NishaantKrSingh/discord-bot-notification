// bot.js
import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch'; // only used for optional webhook send

// ---- Config ----
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  GEMINI_API_KEY,
  WEBHOOK_URL
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
  console.error('Missing required env vars. See .env.example.');
  process.exit(1);
}

// ---- Simple logger ----
const log = (...args) => console.log('[BOT]', ...args);
const errlog = (...args) => console.error('[BOT ERROR]', ...args);

// ---- Gemini wrapper ----
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Ask Gemini and return text
 * @param {string} question
 * @param {object} opts optional: { model, prefix }
 */
async function askGemini(question, opts = {}) {
  const modelName = opts.model || 'gemini-2.5-flash';
  const prefix = opts.prefix ? opts.prefix + ' ' : '';
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prefix + question);
  // result.response is a streaming-ish object in many libs; using text() like before
  return await result.response.text();
}

// ---- Utility: split message into <=2000 char chunks ----
function splitMessage(text, maxLen = 2000) {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const parts = [];
  const paragraphs = text.split('\n\n'); // prefer splitting on blank lines
  let chunk = '';

  for (const p of paragraphs) {
    const piece = chunk ? ('\n\n' + p) : p;
    if ((chunk + piece).length > maxLen) {
      if (chunk) {
        parts.push(chunk);
        chunk = p;
      } else {
        // single paragraph > maxLen, force-slice
        let i = 0;
        while (i < p.length) {
          parts.push(p.slice(i, i + maxLen));
          i += maxLen;
        }
        chunk = '';
      }
    } else {
      chunk += piece;
    }
  }
  if (chunk) parts.push(chunk);
  return parts;
}

// ---- Optional webhook sender (from your index.js) ----
async function sendWebhookMessage(content) {
  if (!WEBHOOK_URL) {
    log('WEBHOOK_URL not configured — skipping webhook send.');
    return;
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'Notification Bot'
      })
    });
    if (!res.ok) {
      errlog('Webhook failed:', res.status, res.statusText);
    } else {
      log('Webhook message sent');
    }
  } catch (e) {
    errlog('Webhook error', e);
  }
}

// ---- Discord: define command ----
const askCommand = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Gemini a question')
  .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true))
  .toJSON();

// ---- Register commands (guild or global) ----
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    log('Registering application commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [askCommand] });
      log('Registered commands to guild', GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [askCommand] });
      log('Registered global commands (may take up to 1 hour to propagate).');
    }
  } catch (e) {
    errlog('Failed to register commands', e);
    throw e;
  }
}

// ---- Discord client & interaction handling ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  log('Logged in as', client.user.tag);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    await interaction.deferReply(); // give us time

    try {
      // Keep response short request — you can change prefix or remove it
      const promptPrefix = 'Answer briefly and in less than 200 words:';
      const answer = await askGemini(question, { prefix: promptPrefix, model: 'gemini-2.5-flash' });

      if (!answer) {
        return interaction.editReply('No response from Gemini.');
      }

      // If short enough, send directly
      if (answer.length <= 2000) {
        return interaction.editReply(answer);
      }

      // Otherwise split into chunks and follow-up
      const chunks = splitMessage(answer, 2000);
      await interaction.editReply(chunks.shift() || '');
      for (const chunk of chunks) {
        await interaction.followUp({ content: chunk });
      }
    } catch (e) {
      errlog('Error handling /ask', e);

      // If error message is huge / something odd, attach a file with details
      try {
        const fallbackText = String(e?.message ?? 'Unknown error from Gemini');
        const file = new AttachmentBuilder(Buffer.from(fallbackText, 'utf8'), { name: 'error.txt' });
        if (!interaction.replied) {
          await interaction.reply({ content: '❌ Error — see attached file.', files: [file], ephemeral: true });
        } else {
          await interaction.editReply({ content: '❌ Error — see attached file.', files: [file] });
        }
      } catch (e2) {
        errlog('Fallback file send failed', e2);
        if (!interaction.replied) {
          await interaction.reply({ content: '❌ Error fetching response from Gemini.', ephemeral: true });
        } else {
          await interaction.editReply('❌ Error fetching response from Gemini.');
        }
      }
    }
  }
});

// ---- Start ----
(async () => {
  try {
    await registerCommands();
  } catch (e) {
    // registration failed — continue anyway (bot may still run)
    errlog('Command registration error (continuing):', e?.message ?? e);
  }

  await client.login(DISCORD_TOKEN);
  log('Bot started.');
})();

// manual webhook test 
sendWebhookMessage('Bot started — webhook test');
