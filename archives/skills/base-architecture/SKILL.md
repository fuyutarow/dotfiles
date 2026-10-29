---
name: base-architecture
description: "base:architecture_2610.1 — use case を唯一の根にしてシステムを設計し、根から届かないものを機械で拒む。YAGNI を態度ではなく構造にする。新しく作るときも、既にある系を縮めるときも使う。"
---

base:architecture_2610.1

目的
  use case を唯一の根にしてシステムを設計し、根から届かないものを機械で拒む。YAGNI を態度ではなく構造にする。新しく作るときも、既にある系を縮めるときも使う。

基本線
  user story、negative space、invariant は use case を見つけるための入力である。見つけた後は、その use case の契約(誰のために、何を拒み、何が常に成り立つか)として use case の下に畳み込む。独立した一覧として残さない。
  独立した一覧は、それぞれが別々にコードと試験を正当化し、use case の外に系を育てる。
  迷ったら Unix 哲学と Tiger Style に戻る。

1. 根を決める

   1.1 use case の一覧を 1 か所(spec)に置く。各 use case は、名前 `<動詞><目的語>`、種類(Query か Mutation)、actor、契約(story、拒むこと、常に成り立つこと)、結んだ試験を持つ。
   1.2 要件、層、部品の spec は、use case の下にしか置けない。どの use case にも属さない項目は、見つけていない use case の候補として owner に返すか、消す。
   1.3 基盤は、use case を作る、出す、確かめるのに要るものだけを残す。「task が走らせている」「何かが使っている」は残す理由にならない。使い手の連鎖は循環する。

2. 境界を 1 つにする(オニオン)

   2.1 use case が内と外の唯一の interface である。公開の入口は、use case と、その入出力の型と、組み立てだけを出す。
   2.2 部品(core、domain の汎用層)は use case の内側にある。部品を独立した製品として spec に書かず、公開しない。
   2.3 adapter(CLI、web の route、UI の hook)は use case を呼ぶだけにする。use case のない入口は作らず、見つけたら消す。

3. 根から導く

   3.1 名前は use case の名前から機械的に作る。file、export、型、hook、PTB などの builder の名前を、層ごとに別に付けない。
   3.2 効果は型と名前で宣言する。Query は何も変えない。Mutation は chain か記録の状態を変える(chain の外の記録も含む)。hook は `use<UseCase>Query` / `use<UseCase>Mutation` とする。
   3.3 use case 1 つを file 1 つ、export 1 つにする。

4. 届かないものを機械で拒む

   4.1 未使用を見つける道具(knip など)の本番の入口は、根(公開の入口、use case の adapter、use case が要る基盤)だけにする。試験を本番の入口にしない。`export *` の barrel を置かない。
   4.2 spec の検査は、use case の下に結んだ項目だけを束縛する。
   4.3 名前と効果の規則を静的な試験で落とす(名前の形、Query が書き込みの builder を import しないこと、Mutation が builder をちょうど 1 つ使うこと)。
   4.4 これらを commit の gate で落とす。

5. 試験

   5.1 試験の量は契約の数で決まる。契約ごとに、持ち主の層で 1 つ。安全性の境界(権限、改ざん、再送、上限、鍵と秘密)は消さない。
   5.2 use case の外の面を確かめる試験は、その面と一緒に消す。
   5.3 各 use case に、代表の成功と、権限の規則があればその拒否を結ぶ。結んだ試験のない use case は漏れである。

6. 既にある系を縮める

   6.1 引き算で到達する。use case から届く部分は既にあることが多い。作り直す前に、根から届くかで分ける。
   6.2 順序: 境界を use case に置く規則 → use case のない入口の削除 → 公開の入口の組み替え(1 use case 1 file) → 全 use case の組み立て → 道具の判定で一括削除 → gate に入れる。
   6.3 不在を、宣言ごとの人手の検索で確かめない。道具の判定にする。道具の目を塞いでいるもの(barrel、試験の入口)を先に外す。

禁止
  A1 use case から独立した要件、層、部品の一覧で、コードや試験を正当化しない。
  A2 「使い手がある」「task が走らせる」を、残す理由にしない。
  A3 試験を、未使用を見つける道具の本番の入口に入れない。
  A4 `export *` で公開を広げない。
  A5 層ごとに名前を付けない。名前は use case から導く。
  A6 use case を経ない入口(CLI のコマンド、route、hook)を作らない。
  A7 部品を独立した製品として spec に書かない。
  A8 YAGNI を「気をつける」という態度に頼らない。構造と gate で守る。

完了の条件
  公開の入口が、use case と、その入出力の型と、組み立てだけを出している。
  spec のすべての項目が、ちょうど 1 つの use case に属している。
  入口を根だけにした未使用の判定が 0 件で、gate で落ちる。
  名前と効果の規則を落とす静的な試験がある。
  すべての use case に、代表の試験が結ばれている。

由来
  retrospectives の 20261025_coralbase-usecase-boundary-postmortem.md。coralbase は use case が 10 個なのに、spec の 1,066 項目の 53% がどの use case にも属さず、CLI の 43 コマンドのうち 40、web の 24 の入口のうち 21 が use case を持たず、試験と barrel がそれらを生かしていた。
