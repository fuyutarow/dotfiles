# Set-level checks F, E and T

Read when a multi-page set is about to be called complete. These checks test consistency, examples and terms;
they are necessary and never show that the set is organized around the reader's jobs (see SKILL.md, principle 1).

Run all three before a multi-page set is called complete. Record each check's table in the output.
A check passes only when its pass condition holds for every row.

**F — fact consistency.** A fact is any claim a reader can take from more than one place: a value, guarantee,
effect, status, signature, definition, version or scope. Summaries, status tables, glossary entries and examples count.
1. Run the statement scan over the published set (materialize its Markdown and TOML pages in one directory):
   `bun scripts/fact-scan.ts <doc-dir> --glossary <glossary-file> > scan.md` (paths relative to this skill's directory)
   The unit is a statement: one sentence or table row that states (a) a number with a unit, (b) a status word
   (未確認 未決 未実装 実装済み 予定 解消済み 欠落 決まっていない していません していない unverified undecided unimplemented implemented planned deprecated resolved missing "not yet" "not decided") with the subject
   it qualifies, or (c) a definition ("X は … です", "X とは", "X: …", "X is a …", a glossary row). A table cell is grouped under its row label (and its column header when the label alone is ambiguous); a cell in a status column counts as a status; a reference-table row names its term, so each line that mentions a CamelCase term joins its row. A sentence that states N items (N つ/個/件/項目/items/steps) yields a count-vs-enumeration row when the list or table right after it has a different number of entries. Statements are
   grouped by subject: for a number, the noun phrase before it, its unit family (time, size, or the unit itself;
   no conversion) and each glossary term in the sentence; for a status, the row label or sentence subject, the names
   around it (glossary terms, Latin identifiers, the previous sentence) and a TOML table's name; for a definition,
   the defined term, a glossary term or alias that is the sentence topic or row label. Subjects drop particles and
   case. A group found in two or more files is one row: subject, kinds, location count and each statement with its file:line.
   A word occurrence is not a statement: a glossary headword alone makes no row. stderr gives the group count and the
   total location count. Keep the table as the record of this step. An empty table is a valid result. The scan does
   not judge, and a fact whose sentence the subject rules miss is the hand pass's.
   Bound each judge by locations, not rows: `--max-locations <m>` packs contiguous groups (stable order) so a shard
   has at most m locations, reports every shard's location count on stderr and puts a group larger than m in a shard
   of its own, reported there. Save each shard with `--shard <k>`. Measure the first shard's locations judged per
   minute and set m so that a judge finishes within 600 s; start at m = 150 when nothing is measured.
   Term check (separate; F does not judge it): `--terms --glossary <glossary-file>` prints, per glossary headword,
   every file:line where it occurs, as input for a check of each use against the glossary entry.
2. Before judging a location, open its context in the file: the same section (the block from its heading to the next
   heading, or the list or paragraph group around it); for a table, every row of that table; for TOML, the enclosing
   table. Read that range, not the scan line alone. Compare every statement in it about the same subject with the
   row's fact, including a neighbouring line that contradicts the located line (a TOML comment's contradiction is often
   the next line). Record the range you opened in the `context` column as `file:start-end`.
   Stages divide the work. The scan groups values, status words, definitions, counts and table cells by subject. The
   judge's context reading catches statements the scan does not group: a column that is neither a value nor a status,
   and adjacent lines. The hand pass catches guarantee, refusal, who-can-read/write, status and enforcement sentences.
   Judge each row in a judgment table (Markdown, one row per judged location, nine columns):
   `row term | fact | scope | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location | context`.
   Name one owning page for the fact. `scope` gives the subject, scope and time both statements are about:
   `same` when they agree, otherwise `differs: <owner's scope> / <location's scope>`.
   The verdict is `mismatch` only when both statements are about the same subject, scope and time and their values
   (value, predicate: guarantee or effect, status, or definition) cannot both hold, even when it is not yet clear which
   is right. It is also `mismatch` when the location states the same fact without linking and the values cannot both hold.
   - A summary that only omits detail is `match`. A summary that drops a limiting condition and so widens a guarantee is `mismatch`.
     Positive example (mismatch): owner "Retries happen only on 503 responses, up to 3 attempts." / location "Requests are retried on failure." Both limits are dropped.
     Negative example (match): owner "The retry policy is set in `retry.toml`: up to 3 attempts, on 503 responses only." / location "Retries follow `retry.toml`." The location omits detail and conflicts with nothing.
   - When `scope` says `differs`, the verdict is not `mismatch`: use `match`, or `qualifier-omitted` when the location links to the owner and omits a qualifier.
   - A difference of sense for one word (the same word used in two senses) is verdict `to-T`. It is carried to check T's table, not dropped.
   `qualifier-omitted` when it links to the owner and only omits a qualifier (not a defect); otherwise `match`.
   A judged row has every one of its locations judged (each is the judged location or the owner), each with a
   verdict, file:line on both sides and a quote of the statement on both sides, and a `context` range in the
   location's file that contains the location line. A row without a quote or without a context range is
   unjudged: a verdict alone is not a judgment. Decide the owner per fact, not per shard or per term. When a
   location is a table row, compare every cell of that row with the owner, not only the subject cell.
   - Sharded tables: one judge per shard, in parallel, each within 600 s. A judge validates its own shard
     (`bun scripts/fact-judgments.ts --scan shard-<k>.md --docs <doc-dir> [--glossary <glossary-file>] judgments-<k>.md`)
     and reports only when it exits 0; a record that does not validate is not a judgment.
   - Hand pass (a fact outside the scan's statement shapes is not in it): read every sentence that states a
     guarantee, a refusal, who can read or write something, or a status. Compare each with the other pages that
     state the same thing, and record the comparison in the same table with row term `(hand)`. This pass covers those
     four kinds and enforcement sentences (below).
     An enforcement sentence says that something is enforced, checked, guaranteed or judged (強制・検査・保証・判定;
     enforce, check, guarantee, judge). It is a defect unless it names the component where that happens, the actor who
     performs it, and who can bypass it (or says that nobody can). Record each such sentence as a `(hand)` row whose owner
     and location are that same line, with verdict `mismatch` and fact `enforcement claim without component, actor or bypass`.
     Remove the row once the sentence names all three.
3. Pass: run `bun scripts/fact-judgments.ts --scan scan.md --docs <doc-dir> [--glossary <glossary-file>] judgments-*.md`.
   It must exit 0: judged = total, every judgment row complete with its quotes found on the cited lines, a context
   range that names the location's file and contains the location line, and no location given two owners for the
   same fact. The validator also rejects a `mismatch` whose `scope` says `differs`.
   For each owner conflict, decide the one owner per fact and correct the rows. Then correct every `mismatch` in the
   pages, re-run step 1, delete the judgment rows whose quotes no longer occur, judge the rows the validator lists as
   unjudged, and run it with `--closed` until it exits 0 (no mismatch left). `to-T` rows are complete judgments and do
   not fail the gate; the validator prints their count and lists them for check T. `--closed` fails on `mismatch` only.
   Report F as done only with that final output (its judged/total line, the to-T count and exit status).

**E — example contract.** Every operation, field and argument an example calls must exist in the contract it cites.
1. For each example, list each call, field and argument, and the contract it cites.
2. Resolve each name against the declaration source of that contract (its schema, interface or signature file), not
   against prose describing it. Use a lookup that prints the declaration, and record the declaration found.
3. Pass: each call resolves to one declaration whose arguments match in count, order and required context (such as a
   session or handle). An undefined name, a missing required argument or an extra argument is a defect. Correct the
   example or the contract, and record which one changed.
4. An example whose contract is outside the set's sources is marked unverified, not passed. A name the example
   uses that the contract does not declare may be marked disclosed only with a verdict row that quotes the
   disclosure line (file:line and the quoted text); the undeclared name must appear in that quoted line. A
   disclosure that does not name it leaves the example unverified.
5. Also report the names the contract omits (contract-side gaps): each operation, field or argument that the
   set's examples or pages use as part of the contract but its declaration source does not declare, with the cited line.

**T — term mapping.** One term keeps one sense and one name across the set: body text, navigation labels,
page titles, headings and the repository's own conventions agree, or the page qualifies the other sense at each use.
1. Run the listing over the published set, with the glossary, the navigation config and each convention file or directory
   (paths relative to this skill's directory):
   `bun scripts/term-scan.ts <doc-dir> --glossary <glossary-file> [--labels <nav-config>] [--convention <file-or-dir>]... [--max-units <m> --shard <k>] > terms.md`
   The listing has three kinds of unit. (a) A glossary headword's body uses, one unit per (term, file), with the count and up
   to two representative lines. (b) Each label, title, heading or convention line, as its own unit. A label's name also
   gets its body group, so the label is judged against the page that holds it. (c) A variant cluster: names that normalize
   to one key (case folded, separators removed, a loanword table such as サーバー/server) or share a head word with a bare
   name (CoralbaseCore, move/core and 鍵 server join core and server). A name differing from another only by case is not a
   cluster. Non-glossary names get no body groups otherwise. stderr gives the unit total, its breakdown (glossary body groups,
   label-linked body groups, label/title/heading rows, convention rows, variant clusters) and the cluster count. The listing
   does not judge. Kanji-only terms without a glossary entry are not listed; read the labels and headings for them.
2. Judge each unit into a table with the columns `term | sense | page:line | quote | defect kind`. A body group is judged once
   per file and its `sense` covers every use in that file; `page:line` is its first line. A label, title, heading or convention
   unit is judged on its own line. A variant cluster is one unit: its candidate defect kind is `two names for one referent`,
   and the judge confirms it or splits it, with the files and counts listed in the row. The defect kind is one of: `two senses
   unqualified` (one name carries two senses and the use does not qualify which); `two names for one referent` (one referent
   has two or more names in the set); `clash with upstream or convention` (the use's sense differs from the upstream
   specification or a named convention file for the same name); `label contradicts content or facts` (a navigation label,
   title or heading names a kind, audience, license or availability that the page's content or stated facts contradict); or
   `—` when the use has none of these. A label passes only if it matches the content's kind and the stated facts.
   Shard the units by `--max-units <m>`: one judge per shard, each within 600 s, validated against its own shard. Start at
   m = 150 when nothing is measured; after the first shard, measure units judged per minute and set m so that a judge
   finishes within 600 s.
3. Pass: every unit's defect kind is `—`, or it is corrected in the page, the label or the convention reference. Correct,
   re-run step 1, and re-judge the changed units. Report T as done with the total unit count, the breakdown on stderr and
   the judged table's defect count. T is a set-level check; run it with F and E before a multi-page set is called complete.
