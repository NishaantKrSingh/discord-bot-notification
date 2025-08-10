// index.js
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// 1. Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function run(question) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Answer this briefly and in less than 200 words: "+question);
    return result.response.text();
}

// 2. Setup Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 3. Register slash command `/ask`
const commands = [
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Gemini a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question to Gemini')
                .setRequired(true)
        )
].map(command => command.toJSON());

// Register the commands with Discord
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('Refreshing application commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Commands registered!');
    } catch (error) {
        console.error(error);
    }
})();

// 4. Handle slash command execution
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ask') {
        const question = interaction.options.getString('question');
        await interaction.deferReply(); // in case Gemini takes time

        try {
            const answer = await run(question);
            await interaction.editReply(answer || "No response from Gemini.");
        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Error fetching response from Gemini.");
        }
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
