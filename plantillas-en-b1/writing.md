# Generation template — B1 Preliminary · Writing (`module: schreiben`)

Return **JSON only**. `passages: []`. Produce **exactly 2** task prompts (Part 1 + Part 2).

- **Teil 1 — Email (mandatory).** Give a short input email (from a friend/teacher, ~40-60 words)
  plus 4 notes the candidate must respond to. Target ~100 words (100-120). `taskTypes:["email"]`, `mandatory:true`.
- **Teil 2 — Article OR Story (choice).** Provide both options:
  - Article: a question/prompt from a magazine/website inviting the candidate's views.
  - Story: a given first sentence OR a title the story must be based on.
  Target ~100 words. `taskTypes:["article","story"]`, `mandatory:false`.

## Quality rules
- Prompts are self-contained, B1-appropriate, everyday topics.
- No essay/review prompts (B2 First). Max 20 marks each (informational).

## IDs
Questions `en-b1-w-t1-{slug}-q1`, `en-b1-w-t2-{slug}-q1`.
Every item: `"language":"en","level":"B1","examType":"cambridge","module":"schreiben"`.
