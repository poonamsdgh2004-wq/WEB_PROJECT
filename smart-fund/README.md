# Smart Fund

Create, browse, and donate to fundraising campaigns. Node.js + Express REST API with JSON file storage and a responsive HTML/CSS/JS frontend.

## Run
```bash
npm install
npm start
```
Open http://localhost:3000

## API
- `GET /api/campaigns`
- `GET /api/campaigns/:id`
- `POST /api/campaigns` — `{ title, creator, category, goal, description }`
- `POST /api/campaigns/:id/donate` — `{ amount, name?, message? }`
