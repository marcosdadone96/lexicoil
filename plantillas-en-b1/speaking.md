# Generation template — B1 Preliminary · Speaking (`module: sprechen`)

Return **JSON only**. `passages: []`. One task prompt per Part.

- **Teil 1 — Interview (2 min).** Examiner questions about the candidate (home, work/study, free time, likes/dislikes). `taskTypes:["interview"]`.
- **Teil 2 — Extended turn (3 min).** Describe **one colour photograph** for ~1 minute; provide a clear photo description brief. `taskTypes:["photo_description"]`.
- **Teil 3 — Collaborative task (4 min).** A situation with several options (illustrated prompt); candidates make and respond to suggestions and reach agreement. `taskTypes:["collaborative_task"]`.
- **Teil 4 — General conversation (3 min).** Discussion linked to Part 3 topic: likes, dislikes, experiences, opinions, habits. `taskTypes:["general_conversation"]`.

## Quality rules
- Everyday B1 topics; prompts usable face-to-face with 2 candidates + 2 examiners.
- No monologue/presentation-only framing beyond Part 2's extended turn.

## IDs
Questions `en-b1-s-t{TEIL}-{slug}-q1`.
Every item: `"language":"en","level":"B1","examType":"cambridge","module":"sprechen"`.
