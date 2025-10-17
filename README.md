# LION Project

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/mnw/v0-sidebar-layout)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/VMMjLWblwXH)

## Overview

This repository will stay in sync with your deployed chats on [v0.dev](https://v0.dev).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.dev](https://v0.dev).


## How It Works

1. Create and modify your project using [v0.dev](https://v0.dev)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Run Locally (macos)
1. Make sure you have node and pnpm. In terminal enter:

`brew install node`

`npm install -g pnpm`

2. Download Code from Github:

`git clone https://github.com/MorpheusNetwork/ARI.git .`

Or to pull from a specific branch (for example the v0 branch):

`git clone -b develop https://github.com/MorpheusNetwork/ARI.git .`

3. Run pnpm:

`pnpm install`

4. Run the development server:

`pnpm dev`

Or `pnpm run dev`

Or to enable Next.js Turbopack (for faster local development):

`pnpm next dev --turbo`

5. Setup .env.local variables file. File is stored in 1Password.

6. Open web browser:

`http://localhost:3000`
