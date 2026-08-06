# Simulación G1 — pool v6.1-B

- **Baseline:** 104 findings
- **Tras G1:** 89 findings (−15)
- **MUST_CATCH afectados:** 0 (objetivo: 0)
- **MUST_NOT_FLAG afectados:** 0
- **Grupo sustantivado eliminado:** 14/14

- **Extra eliminados (fuera del grupo 14):** 1
  - `Niedrigen` en `lesen-t5-gemini-060.json` / `passages.text` (adj_before_noun)

## 14 findings sustantivados eliminados por G1

### 1. `Yogalehrer` — `lesen-t1-gemini-173.json` / `questions.explanation`
- **Frase:** Sie bekommt nicht nur von ihrem Yogalehrer Unterstützung, sondern auch von den anderen Teilnehmern im Kurs und teilt ihre Erfahrungen mit den Nachbarn.
- **POS/tag:** ADJ/ADJA
- **Prev:** ihrem (DET/PPOSAT)
- **Next:** Unterstützung (NOUN/NN)
- **dep/head:** nk → Unterstützung
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 2. `Freie` — `lesen-t1-gemini-173.json` / `questions.question`
- **Frase:** Sie verbringt ihre Freie Zeit gerne draußen in der Natur.
- **POS/tag:** ADJ/ADJA
- **Prev:** ihre (DET/PPOSAT)
- **Next:** Zeit (NOUN/NN)
- **dep/head:** nk → Zeit
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 3. `Junge` — `lesen-t2-gemini-061.json` / `passages.text`
- **Frase:** Viele Junge Leute träumen davon, im Ausland zu arbeiten und andere Länder kennenzulernen.
- **POS/tag:** ADJ/ADJA
- **Prev:** Viele (DET/PIAT)
- **Next:** Leute (NOUN/NN)
- **dep/head:** nk → Leute
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 4. `Junge` — `lesen-t2-gemini-061.json` / `passages.text`
- **Frase:** Es gibt viele Programme und Organisationen, die Junge Leute bei der Planung und Durchführung unterstützen.
- **POS/tag:** ADJ/ADJA
- **Prev:** die (DET/ART)
- **Next:** Leute (NOUN/NN)
- **dep/head:** nk → Leute
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 5. `Junge` — `lesen-t2-gemini-061.json` / `questions.question`
- **Frase:** Wie reist der Junge Angestellte aus Berlin oft?
- **POS/tag:** ADJ/ADJA
- **Prev:** der (DET/ART)
- **Next:** Angestellte (NOUN/NN)
- **dep/head:** nk → Angestellte
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 6. `Junge` — `lesen-t2-gemini-066.json` / `passages.text`
- **Frase:** Eine aktuelle Umfrage zeigt, dass besonders Junge Erwachsene viel Zeit vor Bildschirmen verbringen.
- **POS/tag:** ADJ/ADJA
- **Prev:** besonders (ADV/ADV)
- **Next:** Erwachsene (NOUN/NN)
- **dep/head:** nk → Erwachsene
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 7. `Junge` — `lesen-t2-gemini-066.json` / `questions.explanation`
- **Frase:** Eine Umfrage zeigt, dass besonders Junge Erwachsene viel Zeit vor Bildschirmen verbringen, um sich zu unterhalten.
- **POS/tag:** ADJ/ADJA
- **Prev:** besonders (ADV/ADV)
- **Next:** Erwachsene (NOUN/NN)
- **dep/head:** nk → Erwachsene
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 8. `Junge` — `lesen-t2-gemini-072.json` / `passages.text`
- **Frase:** Eine aktuelle Umfrage zeigt, dass besonders Junge Menschen Interesse an Smart-Home-Lösungen haben.
- **POS/tag:** ADJ/ADJA
- **Prev:** besonders (ADV/ADV)
- **Next:** Menschen (NOUN/NN)
- **dep/head:** nk → Menschen
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 9. `Junge` — `lesen-t2-gemini-072.json` / `questions.explanation`
- **Frase:** Eine Untersuchung zeigt, dass vor allem Junge Menschen diese Technik praktisch finden und sich dafür interessieren.
- **POS/tag:** ADJ/ADJA
- **Prev:** allem (PRON/PIS)
- **Next:** Menschen (NOUN/NN)
- **dep/head:** nk → Menschen
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 10. `Deutschen` — `lesen-t2-gemini-079.json` / `passages.text`
- **Frase:** Eine aktuelle Studie zeigt, dass viele Bewohner in Deutschen Städten solche Systeme interessant finden.
- **POS/tag:** ADJ/ADJA
- **Prev:** in (ADP/APPR)
- **Next:** Städten (NOUN/NN)
- **dep/head:** nk → Städten
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 11. `Deutschen` — `lesen-t2-gemini-087.json` / `passages.text`
- **Frase:** In vielen Deutschen Städten werden alte Kreidetafeln in den Schulen durch moderne digitale Tafeln ersetzt.
- **POS/tag:** ADJ/ADJA
- **Prev:** vielen (DET/PIAT)
- **Next:** Städten (NOUN/NN)
- **dep/head:** nk → Städten
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 12. `Hamburger` — `lesen-t2-gemini-088.json` / `passages.text`
- **Frase:** Ein neues Wohnprojekt in der Hamburger Innenstadt bringt verschiedene Generationen zusammen.
- **POS/tag:** ADJ/ADJA
- **Prev:** der (DET/ART)
- **Next:** Innenstadt (NOUN/NN)
- **dep/head:** nk → Innenstadt
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 13. `Deutschen` — `lesen-t2-gemini-088.json` / `passages.text`
- **Frase:** Immer mehr Bewohner in Deutschen Großstädten entdecken ihre Dächer neu.
- **POS/tag:** ADJ/ADJA
- **Prev:** in (ADP/APPR)
- **Next:** Großstädten (NOUN/NN)
- **dep/head:** nk → Großstädten
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier

### 14. `Junge` — `lesen-t5-gemini-045.json` / `questions.question`
- **Frase:** Welche Altersregelungen gelten für Junge Mitglieder im Studio?
- **POS/tag:** ADJ/ADJA
- **Prev:** für (ADP/APPR)
- **Next:** Mitglieder (NOUN/NN)
- **dep/head:** nk → Mitglieder
- **G1 motivo:** G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, is_adjective_before_following_noun → substantivized modifier
