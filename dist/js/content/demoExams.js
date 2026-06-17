/* Demo exams � English (Cambridge-style) + German via GoetheDemoExams. */
const DemoExams = (() => {
  const CAMBRIDGE = {
    A1: 'A1 Key (KET)',
    A2: 'A2 Key for Schools',
    B1: 'B1 Preliminary (PET)',
    B2: 'B2 First (FCE)',
    C1: 'C1 Advanced (CAE)',
    C2: 'C2 Proficiency (CPE)',
  };

  function mc(id, q, a, b, c, correct) {
    return { id, type: 'multiple', question: q, options: [`a) ${a}`, `b) ${b}`, `c) ${c}`], correct };
  }
  function mc4(id, q, a, b, c, d, correct) {
    const key = String(correct).toUpperCase();
    return { id, type: 'multiple', question: q, options: [`A) ${a}`, `B) ${b}`, `C) ${c}`, `D) ${d}`], correct: key };
  }
  function rf(id, q, correct) {
    return { id, type: 'tf', question: q, correct };
  }
  function matchOpt(id, q, correct) {
    const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '0'];
    return { id, type: 'match', question: q, options: keys, correct, matchLabels: keys };
  }

  function buildEn(level, topic, blocks) {
    return {
      demo: true,
      topic,
      level,
      lang: 'en',
      official: {
        board: 'Cambridge English',
        certificate: CAMBRIDGE[level],
        note: 'Sample exam (Demo). Format based on official Cambridge papers.',
      },
      lesen: {
        teil: 'Paper 1: Reading',
        instruction: blocks.lesenInstr || `Reading ${level}\nRead the text and answer the questions.`,
        textTitle: blocks.lesen.textTitle,
        text: blocks.lesen.text,
        questions: blocks.lesen.questions,
      },
      horen: {
        teil: 'Paper 2: Listening',
        instruction: blocks.horenInstr || `Listening ${level}\nYou will hear the recording twice.`,
        context: blocks.horen.context,
        transcript: blocks.horen.transcript,
        questions: blocks.horen.questions,
      },
      gapfill: {
        teil: 'Part 3: Language in Use',
        instruction: `Language in use ${level}\nChoose the correct word (a, b or c) for each gap.`,
        sentences: blocks.gaps.map(([id, text, answer, options]) => ({ id, text, answer, options })),
      },
      schreiben: blocks.schreiben,
      sprechen: blocks.sprechen,
    };
  }

  function buildA1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'A1',
      topic: 'Daily Life and People',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'A1 Key (KET)',
        note: 'Sample exam (Demo). Format based on Cambridge English: Key (A1).',
      },
      modules: {
        lesen: { title: 'Reading', time: '30 minutes (Reading and Writing combined)' },
        horen: { title: 'Listening', time: 'approx. 20 minutes' },
        schreiben: { title: 'Writing', time: '30 minutes (Reading and Writing combined)' },
        sprechen: { title: 'Speaking', time: 'approx. 8 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '15 minutes',
          instruction:
            'Reading Part 1\nFor each question, choose the correct answer A, B or C.\nYou will read five short texts. Each text has one question.',
          items: [
            {
              id: 'r1',
              signText: 'Swimming pool closed on Mondays. Open 9am-6pm on other days.',
              question: 'When can you use the pool?',
              options: ['A) Every day', 'B) Not on Mondays', 'C) Only in the mornings'],
              correct: 'B',
            },
            {
              id: 'r2',
              signText: 'Library closed for cleaning on 12 March. Open again on 13 March.',
              question: 'What does this say?',
              options: ['A) The library is open on 12 March', 'B) The library opens on 13 March', 'C) The library is closed all week'],
              correct: 'B',
            },
            {
              id: 'r3',
              signText: 'Text from Ben: I am at the bus stop. The bus is late. I can come at 4:15, not 4:00. Sorry!',
              question: 'What is Ben doing?',
              options: ['A) He is at home', 'B) He is waiting for a bus', 'C) He is at school'],
              correct: 'B',
            },
            {
              id: 'r4',
              signText: 'Cafe Rosa needs a waiter. Work on Saturdays and Sundays. Phone 01865 552 901.',
              question: 'What is this?',
              options: ['A) A menu', 'B) A job advert', 'C) A bus timetable'],
              correct: 'B',
            },
            {
              id: 'r5',
              signText: 'Supermarket open Monday to Friday 8am-9pm. Saturday 8am-6pm. Closed on Sunday.',
              question: 'When is the supermarket closed?',
              options: ['A) On Saturday', 'B) On Sunday', 'C) At 9pm on Monday'],
              correct: 'B',
            },
          ],
        },
        {
          teil: 2,
          arbeitszeit: '15 minutes',
          instruction:
            'Reading Part 2\nRead the email and the sentences below.\nAre the sentences True or False?',
          textTitle: 'Email from Emma to Sophie',
          text:
            'Hi Sophie,\n\nHow are you? I had a nice weekend. On Saturday I visited my grandmother in Brighton. She is seventy-six and she lives in a small blue house near the sea. Her house has a small garden with red flowers. We had lunch at one o\'clock and we walked on the beach.\n\nOn Sunday I worked at the bookshop from nine to three. After work I met my brother Paul at the Green Cafe. He is twenty-two and he studies music at college.\n\nWrite soon!\nEmma',
          questions: [
            rf('r6', '6  Emma visited her grandmother on Saturday.', 'R'),
            rf('r7', '7  Emma\'s grandmother lives in London.', 'F'),
            rf('r8', '8  Emma worked at the bookshop on Sunday.', 'R'),
            rf('r9', '9  Paul studies music at college.', 'R'),
            rf('r10', '10  Emma and Paul had lunch at the Green Cafe.', 'F'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nFor each question, choose the correct answer A, B or C.\nYou will hear five short recordings. You will hear each recording twice.',
          segments: [
            {
              id: 'l1',
              label: 'Recording 1: Voicemail',
              transcript:
                'Hello. This is Mr Brown, your English teacher. Today\'s class is at three o\'clock, but I can\'t come to school. I am at home because I am ill. Please do the exercises on page twelve. See you tomorrow.',
              question: '1  Why can\'t Mr Brown come to school today?',
              options: ['A) He is on holiday', 'B) He is ill', 'C) He is at a meeting'],
              correct: 'B',
            },
            {
              id: 'l2',
              label: 'Recording 2: Announcement',
              transcript:
                'Attention please. The school canteen is closed today because of a water problem. You can buy sandwiches and fruit in the library shop. The canteen is open again tomorrow.',
              question: '2  Where can students buy food today?',
              options: ['A) In the canteen', 'B) In the library shop', 'C) In the sports hall'],
              correct: 'B',
            },
            {
              id: 'l3',
              label: 'Recording 3: Short conversation',
              transcript:
                'A: What time does the film start?\nB: At half past seven.\nA: OK. Can we meet at the cinema at seven o\'clock?\nB: Yes, good idea.',
              question: '3  What time do they meet?',
              options: ['A) At 6:30', 'B) At 7:00', 'C) At 7:30'],
              correct: 'B',
            },
            {
              id: 'l4',
              label: 'Recording 4: Message',
              transcript:
                'Hi Anna, it\'s Tom. My birthday party is on Saturday at my house. It starts at five o\'clock. Can you come? Please bring a friend. Call me today. Thanks!',
              question: '4  What is Tom talking about?',
              options: ['A) A school trip', 'B) A birthday party', 'C) A football match'],
              correct: 'B',
            },
            {
              id: 'l5',
              label: 'Recording 5: Shop announcement',
              transcript:
                'Welcome to City Clothes. Today only, all T-shirts are five pounds. Shoes are twenty-five pounds. The shop closes at eight o\'clock this evening.',
              question: '5  How much are the T-shirts today?',
              options: ['A) Five pounds', 'B) Eight pounds', 'C) Twenty-five pounds'],
              correct: 'A',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nListen to the conversation and read the sentences.\nAre the sentences True or False?\nYou will hear the recording twice.',
          context: 'Two friends talk about dinner at home.',
          transcript:
            'A: Hi Mia. Do you want to come to my house for dinner on Friday?\nB: Yes, I can come. What time?\nA: We eat at half past six. My mum is cooking chicken and rice.\nB: Can I bring my sister Ella? She is twelve.\nA: Of course! My dad can pick you up at the bus stop at six o\'clock.\nB: Great. Can we bring an apple pie?\nA: Yes please. See you on Friday!',
          questions: [
            rf('l6', '6  The dinner is on Friday.', 'R'),
            rf('l7', '7  They eat at six o\'clock.', 'F'),
            rf('l8', '8  Ella is Mia\'s sister.', 'R'),
            rf('l9', '9  Mia\'s dad will pick them up.', 'F'),
            rf('l10', '10  They want to bring an apple pie.', 'R'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '15 minutes',
          fieldId: 'write1',
          task:
            'Writing Part 1\nComplete the form below.\nUse the information in the text.\n\nNew member form � Hill Street Sports Club\nPlease write this information on the form.\nName: Carlos Mendez\nAge: 19\nNationality: Spanish\nEmail: carlos.mendez@email.com\nPhone: 07700 900 456\nFavourite sport: basketball',
          formFields: ['Full name:', 'Age:', 'Nationality:', 'Email:', 'Phone number:', 'Favourite sport:'],
          criteria: ['All six fields completed', 'Correct information copied', 'Spelling of names and email'],
          modelAnswer: 'Carlos Mendez\n19\nSpanish\ncarlos.mendez@email.com\n07700 900 456\nbasketball',
          feedback: ['All six fields filled', 'Information matches the text', 'Clear handwriting/spelling'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '15 minutes',
          fieldId: 'write2',
          task:
            'Writing Part 2\nWrite a short message to your friend Tom (about 25-30 words).\n\nWrite about:\n- where you are going on Saturday\n- what time you will meet\n- what you want to bring',
          minWords: 25,
          criteria: ['All three points included', 'Message to a friend', 'About 25-30 words'],
          modelAnswer:
            'Hi Tom! I am going to the park on Saturday. Can we meet at two o\'clock near the lake? I can bring sandwiches and orange juice. See you!',
          feedback: ['Friendly tone', 'All three bullet points', 'About 25-30 words'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Personal questions',
          dauer: 'approx. 3 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1\nThe examiner will ask you some questions about yourself.\nAnswer in full sentences.',
          points: [
            'What is your name?',
            'Where are you from?',
            'Do you work or are you a student?',
            'What is your favourite hobby?',
            'Tell me about your family.',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: What is your name?\nMe: My name is Sofia Martinez.\nExaminer: Where are you from?\nMe: I am from Spain, but I live in Manchester now.\nExaminer: Do you work or are you a student?\nMe: I am a student. I study English at college.\nExaminer: What is your favourite hobby?\nMe: I like reading and cooking.\nExaminer: Tell me about your family.\nMe: I live with my mother and my younger brother. My brother is fifteen.',
          feedback: ['Full sentences', 'All five topics covered', 'Simple present and have got'],
        },
        {
          teil: 2,
          title: 'Describe a picture',
          dauer: 'approx. 3 minutes',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2\nLook at the picture and describe it.\nSay where the people are, what they are doing and what you can see.',
          photoDescriptions: [
            'A family of four is in a park on a sunny day.',
            'The mother is sitting on a green bench and reading a book.',
            'Two children are playing with a red ball on the grass.',
            'The father is standing near a tree and taking a photo with his phone.',
          ],
          points: ['Say where the people are', 'Say what the people are doing', 'Describe objects and colours'],
          minWords: 30,
          modelAnswer:
            'In this picture I can see a family in a park. It is sunny. The mother is sitting on a green bench and she is reading a book. Two children are playing with a red ball on the grass. The father is standing near a tree and he is taking a photo with his phone. There are trees and grass in the park.',
          feedback: ['Present continuous for actions', 'Location and colours', 'Four or five sentences'],
        },
      ],
    };
  }

  function buildA2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'A2',
      topic: 'Shopping, Travel and Free Time',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'A2 Key for Schools',
        note: 'Sample exam (Demo). Format based on Cambridge English: Key (A2).',
      },
      modules: {
        lesen: { title: 'Reading', time: '60 minutes (Reading and Writing combined)' },
        horen: { title: 'Listening', time: 'approx. 30 minutes' },
        schreiben: { title: 'Writing', time: '60 minutes (Reading and Writing combined)' },
        sprechen: { title: 'Speaking', time: 'approx. 10 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          arbeitszeit: '20 minutes',
          instruction:
            'Reading Part 1\nFor each question, choose the correct answer A, B or C.\nYou will read six short texts.',
          items: [
            {
              id: 'r1',
              signText: 'Email from Travel Shop: Your order will arrive on Thursday, not Wednesday. Sorry for the delay. Track your package online.',
              question: '1  What does the email say about the order?',
              options: ['A) It arrived yesterday', 'B) It will come on Thursday', 'C) It cannot be tracked'],
              correct: 'B',
            },
            {
              id: 'r2',
              signText: 'Bus to airport: every 30 minutes from City Station. First bus 5:15 am. Last bus 11:45 pm. Single ticket 8 pounds.',
              question: '2  How often do the buses run?',
              options: ['A) Every 15 minutes', 'B) Every 30 minutes', 'C) Every hour'],
              correct: 'B',
            },
            {
              id: 'r3',
              signText: 'Message from Mia: The football match is cancelled because of rain. We are going to the cinema instead. Meet at 6 pm outside the Odeon.',
              question: '3  What are Mia and her friends going to do?',
              options: ['A) Play football', 'B) Stay at home', 'C) Go to the cinema'],
              correct: 'C',
            },
            {
              id: 'r4',
              signText: 'Winter Sale! All coats now 30% cheaper. Offer ends Sunday. No returns on sale items.',
              question: '4  What should customers remember?',
              options: ['A) They can return sale coats', 'B) Coats are more expensive now', 'C) They cannot return sale items'],
              correct: 'C',
            },
            {
              id: 'r5',
              signText: 'Sign at museum: Free entry for children under 12. Adults 10 pounds. Open Tuesday to Sunday. Closed on Monday.',
              question: '5  Who can visit the museum for free?',
              options: ['A) All adults', 'B) Children under 12', 'C) Everyone on Monday'],
              correct: 'B',
            },
            {
              id: 'r6',
              signText: 'Text from Ben: I left my blue rucksack on the 14:20 train to Bristol. Did anyone see it? Reward offered. Call 07700 123 456.',
              question: '6  What is Ben looking for?',
              options: ['A) His train ticket', 'B) His bag', 'C) A phone number'],
              correct: 'B',
            },
          ],
        },
        {
          teil: 2,
          arbeitszeit: '20 minutes',
          instruction:
            'Reading Part 2\nThe people below are all looking for something for their free time or travel.\nOn the next page there are descriptions of eight places and services.\nDecide which would be most suitable for each person.\nFor questions 7-11, choose the correct letter A-H.',
          ads: [
            { key: 'A', title: 'Blue Cinema', text: 'Shows English-language films every Tuesday and Thursday. Tickets from 6 pounds. Snacks available.' },
            { key: 'B', title: 'Easy Ride Centre', text: 'Beginner cycling routes with free maps. Open daily 9 am-6 pm. Bike hire from 12 pounds.' },
            { key: 'C', title: 'Rail Save', text: 'Discount train tickets when you book at least seven days ahead. Destinations across the UK.' },
            { key: 'D', title: 'Morning Pool', text: 'Swimming pool open 6-9 am only. No evening classes. Day pass 5 pounds.' },
            { key: 'E', title: 'Kitchen World', text: 'Cooking books, tools and gift sets from 15 pounds. Free gift wrapping on Saturdays.' },
            { key: 'F', title: 'Same-Day Rail', text: 'Train tickets for travel today only. No advance booking. Prices can be higher.' },
            { key: 'G', title: 'Sports Zone', text: 'Football boots, team shirts and gym bags. No bicycles or maps.' },
            { key: 'H', title: 'Aqua Plus', text: 'Pool with evening swim classes on Mondays and Wednesdays. Monthly membership 30 pounds.' },
          ],
          questions: [
            matchOpt('r7', '7  James wants the cheapest train tickets to Edinburgh and he can book a week before he travels.', 'C'),
            matchOpt('r8', '8  Nina needs a swimming pool with classes after work in the evening.', 'H'),
            matchOpt('r9', '9  Omar wants to buy a present for his mother. She enjoys cooking.', 'E'),
            matchOpt('r10', '10  Sophie is a beginner and wants to go cycling outdoors with a map.', 'B'),
            matchOpt('r11', '11  Tom prefers watching films in English and he has a small budget.', 'A'),
          ],
        },
        {
          teil: 3,
          arbeitszeit: '20 minutes',
          instruction:
            'Reading Part 3\nFor each question, choose the correct answer A, B or C.\nRead the following article.',
          textTitle: 'A Weekend in Brighton',
          text:
            'Last month my friends and I went to Brighton for the weekend. We travelled by train on Friday afternoon because tickets were cheaper than on Saturday. The journey took two hours from London.\n\nOn Saturday morning we walked along the beach. It was windy but sunny. We bought fish and chips for lunch. They were delicious but more expensive than the sandwiches we usually buy at home. In the afternoon we visited the Lanes � small streets with interesting shops. I bought a blue scarf for my sister. It was the cheapest gift in the shop, but she loved it.\n\nOn Sunday we went to the pier. My friend Tom wanted to go on the biggest ride, but we were too afraid! Instead we played games and won a small teddy bear. We went home at five o\'clock because I had to study for an exam on Monday.\n\nIt was a great trip and we are going to visit again in the summer.',
          questions: [
            mc('r12', '12  Why did they travel on Friday afternoon?', 'Tickets were cheaper than on Saturday', 'The beach was quieter on Friday', 'Tom had an exam on Friday', 'a'),
            mc('r13', '13  What did the writer buy in the Lanes?', 'A teddy bear', 'A blue scarf', 'Fish and chips', 'b'),
            mc('r14', '14  Why didn\'t they go on the biggest ride?', 'It was closed', 'They were too afraid', 'It was too expensive', 'b'),
            mc('r15', '15  When are they going to visit Brighton again?', 'In the summer', 'Next month', 'On Monday', 'a'),
            mc('r16', '16  What was more expensive than the food they usually buy?', 'Train tickets', 'Fish and chips', 'The scarf', 'b'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nFor each question, choose the correct answer A, B or C.\nYou will hear five short conversations. You will hear each conversation twice.',
          segments: [
            {
              id: 'l1',
              label: 'Conversation 1: Hotel booking',
              transcript:
                'A: Hello, I booked a room for two nights from the tenth of May.\nB: Yes, I can see your booking. A double room with breakfast.\nA: Can I change it to three nights? I am going to stay longer.\nB: Yes, that is fine. The price will be 120 pounds in total.',
              question: '1  How many nights will the customer stay?',
              options: ['A) Two nights', 'B) Three nights', 'C) Ten nights'],
              correct: 'B',
            },
            {
              id: 'l2',
              label: 'Conversation 2: Clothes shop',
              transcript:
                'A: I bought this jacket here last week, but it is too small.\nB: Do you have the receipt?\nA: Yes, here it is. Can I change it for a bigger size?\nB: Of course. The larger size costs the same. You can choose another colour too.',
              question: '2  Why did the customer come back to the shop?',
              options: ['A) The jacket was too small', 'B) She lost the receipt', 'C) She wanted a cheaper jacket'],
              correct: 'A',
            },
            {
              id: 'l3',
              label: 'Conversation 3: Cinema plans',
              transcript:
                'A: Shall we see the new comedy tonight?\nB: I can\'t. I am working until eight o\'clock.\nA: What about tomorrow? The film starts at half past six.\nB: OK, tomorrow is better. Let\'s buy tickets online.',
              question: '3  When are they going to the cinema?',
              options: ['A) Tonight', 'B) Tomorrow', 'C) At eight o\'clock tonight'],
              correct: 'B',
            },
            {
              id: 'l4',
              label: 'Conversation 4: Train tickets',
              transcript:
                'A: Two return tickets to Oxford, please.\nB: Single or return?\nA: Return, please. We are coming back on Sunday evening.\nB: That is 34 pounds. The train leaves from platform four in ten minutes.',
              question: '4  How much do the tickets cost?',
              options: ['A) 24 pounds', 'B) 34 pounds', 'C) 44 pounds'],
              correct: 'B',
            },
            {
              id: 'l5',
              label: 'Conversation 5: Restaurant choice',
              transcript:
                'A: I am really hungry after the walk.\nB: Me too. There is a pizza place near the park, or we could take the bus to the Italian restaurant by the river.\nA: The pizza place is quicker. I don\'t want to wait long.\nB: OK, let\'s go there. It is cheaper too.',
              question: '5  Where are they going to eat?',
              options: ['A) At the Italian restaurant', 'B) At the pizza place near the park', 'C) On the bus'],
              correct: 'B',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nYou will hear some information about a summer music festival.\nFor each question, fill in the missing information in the numbered space.\nYou will hear the recording twice.',
          context: 'Summer music festival � information for visitors.',
          transcript:
            'Welcome to the Riverside Summer Festival. This year the festival is called Sun Sounds. It takes place on the sixteenth of July in the town of Chester. Gates open at eleven in the morning and the first concert starts at twelve o\'clock. An adult ticket costs eighteen pounds, but children under sixteen pay half price. You can buy food from local shops and there is free parking near the river. The festival finishes at ten pm. For more information, visit www.sunsounds-fest.co.uk.',
          notesTitle: 'Sun Sounds Festival � Notes',
          noteFields: [
            { id: 'l6', label: '6  Name of festival:', answer: 'Sun Sounds' },
            { id: 'l7', label: '7  Date:', answer: '16 July' },
            { id: 'l8', label: '8  Town:', answer: 'Chester' },
            { id: 'l9', label: '9  Price of adult ticket:', answer: '18 pounds' },
            { id: 'l10', label: '10  Time first concert starts:', answer: '12' },
          ],
        },
        {
          teil: 3,
          plays: 2,
          instruction:
            'Listening Part 3\nListen to the conversation and read the sentences.\nAre the sentences True or False?\nYou will hear the recording twice.',
          context: 'Two friends talk about shopping and plans for the weekend.',
          transcript:
            'A: I went to the new shopping centre yesterday. It is bigger than the old one, but the clothes were more expensive than I expected.\nB: Did you buy anything?\nA: Yes, I got a red dress for my sister\'s birthday. It was on sale, so it was cheaper than the blue one.\nB: Are you free on Saturday? We could go to the market and then see a film.\nA: I can\'t on Saturday morning because I am visiting my aunt. But I am free in the afternoon after two o\'clock.\nB: Perfect. The market closes at four, so we should meet at one thirty near the bus station.\nA: OK. I am going to bring my shopping list because I need a new pair of shoes.',
          questions: [
            rf('l11', '11  The new shopping centre is smaller than the old one.', 'F'),
            rf('l12', '12  Person A bought a red dress.', 'R'),
            rf('l13', '13  Person A is free all day on Saturday.', 'F'),
            rf('l14', '14  They are going to meet at half past one.', 'R'),
            rf('l15', '15  Person A needs to buy shoes.', 'R'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '30 minutes',
          fieldId: 'write1',
          task:
            'Writing\nWrite an email to your friend (about 80 words).\n\nYou are planning a short trip with friends next month. Write an email to your friend Alex.\n\nWrite about:\n- where you want to go and why\n- how you will travel\n- what you want to do there\n- when you want to meet to plan the trip',
          minWords: 80,
          criteria: ['All four points included', 'Email format with greeting and sign-off', 'About 80 words', 'A2 grammar and vocabulary'],
          modelAnswer:
            'Hi Alex,\n\nHow are you? Next month I want to visit York with some friends because the city is beautiful and there are great shops. We are going to go by train on Saturday morning. I would like to walk in the old streets and try a famous cafe. Can we meet on Tuesday after college to plan everything?\n\nBest wishes,\nLaura',
          feedback: ['Friendly email tone', 'All four bullet points', 'Past simple, going to, modals', 'About 80 words'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Personal questions',
          dauer: 'approx. 4 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1\nThe examiner will ask you some questions about shopping, travel and free time.\nAnswer in full sentences.',
          points: [
            'Where do you usually go shopping and what do you like to buy?',
            'Tell me about the last time you travelled somewhere. Where did you go?',
            'What do you usually do in your free time at the weekend?',
            'Do you prefer shopping in big centres or small shops? Why?',
            'Where would you like to go on holiday next year?',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: Where do you usually go shopping and what do you like to buy?\nMe: I usually go to the shopping centre near my home. I like buying clothes and books.\nExaminer: Tell me about the last time you travelled somewhere.\nMe: Last summer I went to Barcelona with my family. We travelled by plane and stayed for five days.\nExaminer: What do you usually do in your free time at the weekend?\nMe: I often meet friends and we go to the cinema or cook together.\nExaminer: Do you prefer shopping in big centres or small shops?\nMe: I prefer small shops because they are quieter and the staff are friendly.\nExaminer: Where would you like to go on holiday next year?\nMe: I would like to visit Scotland because I want to see the mountains and try local food.',
          feedback: ['Full sentences with detail', 'Past simple and would like', 'Topic vocabulary A2'],
        },
        {
          teil: 2,
          title: 'Discuss options together',
          dauer: 'approx. 4 minutes',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2\nYou and the examiner are planning a short holiday together.\nLook at these options and decide which is the best one for you both.\n\nOptions:\n- A beach holiday by the sea\n- A city break with museums and shopping\n- Camping in the mountains\n- Staying with relatives in another town',
          points: [
            'Say what you like and dislike about each option',
            'Compare the options (cheaper, more interesting, etc.)',
            'Agree on the best option together',
            'Give reasons for your choice',
          ],
          minExchanges: 4,
          modelAnswer:
            'Examiner: Which holiday do you prefer?\nMe: I think a city break is the best option because I love visiting museums and shopping.\nExaminer: But camping is cheaper and you can enjoy nature.\nMe: That is true, but I don\'t have a tent and the weather could be bad. A city break is more comfortable.\nExaminer: What about staying with relatives?\nMe: It is cheaper, but we would not be as free. I think the city break is better because we can choose what to do every day.\nExaminer: OK, let\'s choose the city break then.\nMe: Great idea! We should start looking for cheap train tickets.',
          feedback: ['Comparatives and opinions', 'Minimum four exchanges', 'Agreement reached with reasons'],
        },
      ],
    };
  }

  function buildB1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'B1',
      topic: 'Health, Sport and Wellbeing',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'B1 Preliminary (PET)',
        note: 'Sample exam (Demo). Format based on the official Cambridge B1 Preliminary (PET).',
      },
      modules: {
        lesen: { title: 'Reading', time: '45 minutes (Reading and Writing combined)' },
        horen: { title: 'Listening', time: 'approx. 30 minutes' },
        schreiben: { title: 'Writing', time: '45 minutes (Reading and Writing combined)' },
        sprechen: { title: 'Speaking', time: '12 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          instruction:
            'Reading Part 1\nFor each question, choose the correct answer.\nThe texts are short notices, messages and other material.',
          items: [
            {
              id: 'r1',
              signText: 'Physio Plus: Sports massage appointments available this week. Book online by 6 pm. Late cancellations charged 15 pounds.',
              question: '1  What happens if you cancel late?',
              options: ['A) You pay a fee', 'B) You get a free session', 'C) You must book by phone'],
              correct: 'A',
            },
            {
              id: 'r2',
              signText: 'Riverside Pool: Lane swimming only until Friday while diving boards are repaired. Family sessions move to 4 pm.',
              question: '2  What is the notice about?',
              options: ['A) The pool is closed all week', 'B) Some activities are changed temporarily', 'C) Diving lessons are starting'],
              correct: 'B',
            },
            {
              id: 'r3',
              signText: 'Message from Coach Sam: Training is off tonight because of ice on the pitch. We\'ll meet at the sports hall instead at 7:30. Bring indoor shoes.',
              question: '3  Why has the training location changed?',
              options: ['A) The hall is cheaper', 'B) The pitch is unsafe', 'C) Players asked for a later time'],
              correct: 'B',
            },
            {
              id: 'r4',
              signText: 'FitTrack App: Your weekly report is ready. You slept an average of 6.2 hours. Tip: try a screen-free hour before bed.',
              question: '4  What does the app suggest?',
              options: ['A) Exercising more in the morning', 'B) Avoiding screens before sleep', 'C) Deleting your account'],
              correct: 'B',
            },
            {
              id: 'r5',
              signText: 'Health Food Store: Buy two protein bars, get the third half price. Offer valid until Sunday. Not available online.',
              question: '5  Where can you use this offer?',
              options: ['A) Only in the shop', 'B) Only on the website', 'C) In any supermarket'],
              correct: 'A',
            },
          ],
        },
        {
          teil: 2,
          instruction:
            'Reading Part 2\nThe people below want to find a sports or wellbeing service.\nThere are descriptions of eight options on the next page.\nDecide which would be the most suitable for each person.\nFor questions 6-10, choose the correct letter A-H.',
          ads: [
            { key: 'A', title: 'Marathon Hub', text: 'Workshops on running nutrition and pacing. Gait analysis by appointment. Popular with long-distance runners.' },
            { key: 'B', title: 'Aqua Recover', text: 'Physio-led pool sessions for injury recovery. Low-impact only. Medical form required before first visit.' },
            { key: 'C', title: 'City FC Veterans', text: 'Football leagues for players over thirty. Matches on weekday evenings. Teams arranged by ability.' },
            { key: 'D', title: 'Power Gym 24/7', text: 'Weights room with loud music. Open all night. No classes or coaching included.' },
            { key: 'E', title: 'Bloom Studio', text: 'Women-only pilates and strength classes. Beginner groups on Tuesday and Thursday. Small class sizes.' },
            { key: 'F', title: 'Express Fit Central', text: 'Thirty-minute circuit sessions near the business district. Lunchtime slots from 12:15. Shower facilities.' },
            { key: 'G', title: 'Sleep Coach Online', text: 'Video calls about bedtime routines. No physical activity programmes. App subscription required.' },
            { key: 'H', title: 'Trail Runners Club', text: 'Hill runs every Saturday. Steep routes for experienced runners. Not suitable for beginners.' },
          ],
          questions: [
            matchOpt('r6', '6  Priya is recovering from a knee injury and needs gentle, physio-led pool exercise.', 'B'),
            matchOpt('r7', '7  Marco wants a competitive football league for over-thirties on weekdays.', 'C'),
            matchOpt('r8', '8  Hannah is a beginner who feels nervous in mixed gyms and wants supportive classes.', 'E'),
            matchOpt('r9', '9  Leon is training for a marathon and wants help with nutrition and pacing.', 'A'),
            matchOpt('r10', '10  Fatima has short lunch breaks and needs quick workouts near her office.', 'F'),
          ],
        },
        {
          teil: 3,
          instruction:
            'Reading Part 3\nFor each question, choose the correct answer.\nRead the following article.',
          textTitle: 'Are we sleeping enough? How sport clubs are fighting burnout',
          text:
            'When physiotherapist Nina Ortiz started working with amateur runners five years ago, most of her clients wanted faster times. Today, she says, they mainly want to sleep. "People come in exhausted," she explains. "They track every step but ignore rest."\n\nThe shift is visible across local sport centres. Riverside Fitness Club has cut its late-evening HIIT classes because members complained they could not wind down before bed. Manager Paul Keane admits the decision was risky financially, yet attendance at morning yoga has risen by forty per cent since January. "Members told us they needed calm, not more noise," he says.\n\nWearable devices were supposed to make health simpler. However, Dr Helen Marsh from City Hospital argues that constant monitoring can increase anxiety. Her study of two hundred office workers found that those who checked sleep scores nightly reported worse mood, even when they slept adequately. Marsh does not reject technology entirely, but she recommends limiting checks to once a week.\n\nCommunity sport may offer a partial answer. ParkRun organisers in Bristol report growing numbers of parents who join walks rather than runs. Volunteer coach Amir Khan welcomes the change. "Wellbeing isn\'t a number on a screen," he told local reporters last month. "It\'s turning up, chatting, going home tired but happy."\n\nExperts agree there is no single formula. Diet, screen time and workload matter. Still, the message from clubs is clear: moving your body should help you recover, not steal your sleep.',
          questions: [
            mc4('r11', '11  What is the main purpose of the article?', 'To advertise wearable devices', 'To explain why some clubs are changing their approach to fitness', 'To criticise all forms of group exercise', 'To compare different hospitals', 'B'),
            mc4('r12', '12  Why did Riverside Fitness Club stop some evening classes?', 'Members wanted louder music', 'Members struggled to relax before bedtime', 'The manager preferred yoga personally', 'Attendance had already increased', 'B'),
            mc4('r13', '13  What does Dr Marsh suggest about health apps?', 'People should stop using them completely', 'People should check sleep data less often', 'Office workers sleep too much', 'Technology always improves mood', 'B'),
            mc4('r14', '14  What view does Amir Khan express about wellbeing?', 'It depends mainly on running fast times', 'It is best measured with accurate data', 'It includes social contact and satisfaction', 'It requires expensive equipment', 'C'),
            mc4('r15', '15  How does the writer feel about clubs that prioritise recovery?', 'Supportive of the change', 'Angry about lost HIIT classes', 'Unsure whether members will agree', 'Critical of ParkRun walks', 'A'),
          ],
        },
        {
          teil: 4,
          instruction:
            'Reading Part 4\nFor each question, choose the correct answer.\nThe text is about five people\'s opinions on staying healthy through sport.',
          textTitle: 'Five people share their views on sport and wellbeing',
          text:
            'Alice:\nI\'ve never enjoyed exercising alone. For me, the gym is social � you chat between sets and you feel accountable. I tried home workouts during the pandemic, but I gave them up within a month. Team sports are even better because you can\'t skip training without letting someone down.\n\nBen:\nHonestly, gyms are too expensive and crowded. I bought a second-hand bike and some weights for my flat, and that\'s enough. I can train when I want, without waiting for machines. If the weather\'s good, I cycle to work instead of taking the bus � that counts as exercise too.\n\nClara:\nI started running because my doctor said it would help my anxiety. At first I hated it, but I kept going and joined a local club. Now I run with them twice a week. It\'s still hard some days, but I feel clearer afterwards. I wouldn\'t have continued without the group.\n\nDavid:\nI used to go to the gym every day until I hurt my shoulder lifting weights. These days I swim twice a week and I walk more. I\'ve learned that rest isn\'t lazy � it\'s part of training. My younger self would have laughed at that, but I feel better now than I did then.\n\nElena:\nFitness apps helped me build habits at the beginning. I liked seeing progress on my phone. But I became obsessed with my step count and it made me anxious, so I deleted them. Now I follow a simple plan my sister sent me, and I feel calmer. Technology isn\'t bad, but it isn\'t everything either.',
          questions: [
            mc4('r16', '16  Who changed their exercise habits because of a physical problem?', 'Alice', 'Ben', 'Clara', 'David', 'D'),
            mc4('r17', '17  Which two people share a similar positive view of group activity?', 'Alice and Clara', 'Ben and Elena', 'Clara and David', 'Alice and David', 'A'),
            mc4('r18', '18  Who prefers exercising mainly at home?', 'Alice', 'Ben', 'Clara', 'David', 'B'),
            mc4('r19', '19  Who mentions technology making them feel worse?', 'Alice', 'Ben', 'Clara', 'Elena', 'D'),
            mc4('r20', '20  Who recommends sport mainly for mental health reasons?', 'Alice', 'Ben', 'Clara', 'Elena', 'C'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nFor each question, choose the correct answer.\nYou will hear seven short recordings.',
          segments: [
            {
              id: 'l1',
              label: 'Recording 1',
              transcript:
                'A: Hi, I booked a yoga class for six o\'clock, but I\'m running late.\nB: Well, you\'ve got ten minutes. After that, the door is locked for safety.\nA: OK, I\'ll hurry. Actually, is there parking behind the building?\nB: Yeah, but it fills up fast on Mondays.',
              question: '1  What does the woman need to do?',
              options: ['A) Cancel her class', 'B) Arrive within ten minutes', 'C) Pay for parking in advance'],
              correct: 'B',
            },
            {
              id: 'l2',
              label: 'Recording 2',
              transcript:
                'Right, this is a message for members. The sauna will be closed until Thursday while we fix a water leak. The pool and gym stay open as usual. Sorry for the inconvenience.',
              question: '2  What is closed temporarily?',
              options: ['A) The swimming pool', 'B) The gym', 'C) The sauna'],
              correct: 'C',
            },
            {
              id: 'l3',
              label: 'Recording 3',
              transcript:
                'A: Did you see the match last night?\nB: No, I went for a run instead. I\'m trying to sleep better, so I\'m avoiding late TV.\nA: Fair enough. Was it a long run?\nB: About forty minutes � nothing crazy.',
              question: '3  Why didn\'t the man watch the match?',
              options: ['A) He was working', 'B) He was improving his sleep routine', 'C) He doesn\'t like sport'],
              correct: 'B',
            },
            {
              id: 'l4',
              label: 'Recording 4',
              transcript:
                'A: Excuse me, I bought these trainers here last week, but the sole is coming off already.\nB: I see. Have you worn them outdoors?\nA: Just on the treadmill at your gym, actually.\nB: OK, we can exchange them if you bring the receipt.',
              question: '4  What will the shop probably do?',
              options: ['A) Repair the shoes for free', 'B) Give the customer new shoes', 'C) Refuse to help'],
              correct: 'B',
            },
            {
              id: 'l5',
              label: 'Recording 5',
              transcript:
                'A: Are you still coming to pilates on Wednesday?\nB: I can\'t � I\'ve pulled a muscle in my back. The doctor said I should rest for two weeks.\nA: Oh no. Well, text me when you\'re feeling better.\nB: Sure, thanks.',
              question: '5  What has happened to the woman?',
              options: ['A) She has lost her phone', 'B) She has a back injury', 'C) She changed doctors'],
              correct: 'B',
            },
            {
              id: 'l6',
              label: 'Recording 6',
              transcript:
                'Welcome to Green Bowl cafe. Today\'s special is quinoa salad with roasted vegetables. We also have soup and fresh smoothies. Please tell staff if you have any allergies before ordering.',
              question: '6  What is the speaker doing?',
              options: ['A) Advertising a gym', 'B) Describing menu options', 'C) Organising a fun run'],
              correct: 'B',
            },
            {
              id: 'l7',
              label: 'Recording 7',
              transcript:
                'A: Shall we sign up for the charity cycle ride in May?\nB: Maybe. How far is it?\nA: Thirty kilometres. You don\'t have to be super fit, but you should train a bit.\nB: Right. I mean, I could do it if we start practising soon.',
              question: '7  What are they discussing?',
              options: ['A) Joining a cycling event', 'B) Buying new bicycles', 'C) Visiting a charity shop'],
              correct: 'A',
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nFor each question, choose the correct answer.\nYou will hear a conversation between two people about a sports injury.',
          context: 'Two colleagues talk about seeing a physiotherapist.',
          transcript:
            'A: You look a bit fed up. Still having trouble with your knee?\nB: Yeah, it\'s better than last month, but I tried running again and it hurt the next day.\nA: Have you seen anyone about it?\nB: I booked a physio session for next Tuesday at half past four. It\'s at the clinic near the station.\nA: Good idea. Did you have to wait long for an appointment?\nB: About ten days, actually. They suggested I ice it after exercise and do the stretches they emailed me.\nA: Makes sense. Are you still playing football on Saturdays?\nB: No, the physio said I should stop until I can jog without pain. I\'m going to try swimming instead.\nA: Well, let me know how the appointment goes.',
          questions: [
            mc('l8', '8  What is the man\'s main problem?', 'He cannot find the clinic', 'His knee still causes pain after running', 'He missed his appointment', 'b'),
            mc('l9', '9  When is his physiotherapy session?', 'Next Tuesday at 4:30', 'Next Saturday morning', 'In ten days at the station', 'a'),
            mc('l10', '10  What has the clinic already sent him?', 'A bill for treatment', 'Stretching exercises', 'A pair of sports shoes', 'b'),
            mc('l11', '11  What does he plan to do instead of football?', 'Go jogging every day', 'Start swimming', 'Play tennis', 'b'),
            mc('l12', '12  What does the woman offer to do?', 'Book the appointment for him', 'Lend him ice packs', 'Hear about the appointment afterwards', 'c'),
            mc('l13', '13  How long did he wait for the appointment?', 'Ten days', 'One month', 'Until Saturday', 'a'),
          ],
        },
        {
          teil: 3,
          plays: 2,
          instruction:
            'Listening Part 3\nYou will hear some information about a workplace wellbeing fair.\nFor each question, fill in the missing information in the numbered space.\nYou will hear the recording twice.',
          context: 'Announcement about a wellbeing fair at an office park.',
          transcript:
            'Good morning. This is a reminder about the Spring Wellbeing Fair at Riverside Office Park next Thursday, the fourteenth of March. The fair opens at ten am in the atrium beside Cafe North. Entry is free for all employees, but you must register online by Monday. The keynote talk on sleep and stress starts at eleven fifteen in Room B. Free posture checks will be offered by Physio Direct between twelve and two. Healthy lunch samples are available from twelve thirty, though portions are limited. The fair closes at three pm. For registration, visit wellbeingfair-dot-co-dot-uk.',
          notesTitle: 'Spring Wellbeing Fair � Notes',
          noteFields: [
            { id: 'l14', label: '14  Date of fair:', answer: '14 March' },
            { id: 'l15', label: '15  Place:', answer: 'atrium' },
            { id: 'l16', label: '16  Registration deadline:', answer: 'Monday' },
            { id: 'l17', label: '17  Time keynote talk starts:', answer: '11:15' },
            { id: 'l18', label: '18  Company offering posture checks:', answer: 'Physio Direct' },
            { id: 'l19', label: '19  Time fair closes:', answer: '3' },
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Listening Part 4\nFor each question, choose the correct answer.\nYou will hear an interview with a personal trainer.',
          context: 'Radio interview with personal trainer Jess Morgan.',
          transcript:
            'Interviewer: Today we\'re talking to Jess Morgan, a personal trainer who works with beginners. Jess, what\'s the biggest mistake new clients make?\nJess: Well, they often do too much too soon. I mean, they\'ve watched videos online and they think they need to train every day. Actually, rest days are when your body gets stronger.\nInterviewer: How do you keep people motivated?\nJess: I don\'t focus on weight loss straight away. We set small goals � walk up the stairs without getting breathless, sleep better, that kind of thing. If people enjoy the process, they stick with it.\nInterviewer: Some listeners worry gyms are intimidating.\nJess: Yeah, I get that. That\'s why I start a lot of sessions outdoors or at home. Confidence comes first. Once someone feels capable, they\'re happy to join a class.\nInterviewer: What about nutrition advice?\nJess: I\'m not a dietician, so I keep it simple: drink water, eat regular meals, don\'t cut out whole food groups unless a doctor tells you to. Extreme diets usually backfire.\nInterviewer: Any final tip?\nJess: Be kind to yourself. Missing one workout doesn\'t mean you\'ve failed. Consistency over months is what matters, not perfection for a week.',
          questions: [
            mc('l20', '20  What mistake do beginners often make?', 'They refuse to watch online videos', 'They train too frequently without rest', 'They avoid setting any goals', 'b'),
            mc('l21', '21  How does Jess try to motivate clients?', 'By promising rapid weight loss', 'By focusing on small, practical goals', 'By comparing them with other clients', 'b'),
            mc('l22', '22  Why does Jess sometimes train people outdoors?', 'It is cheaper than renting a gym', 'It helps clients feel less intimidated', 'Outdoor sessions are always harder', 'b'),
            mc('l23', '23  What is Jess\'s attitude to strict diets?', 'She strongly recommends them', 'She thinks they often fail', 'She never mentions food', 'b'),
            mc('l24', '24  What does Jess say about missing a workout?', 'It means you should stop completely', 'It is normal and not a failure', 'It requires a longer session next time', 'b'),
            mc('l25', '25  What is Jess\'s overall approach to fitness?', 'Long-term consistency', 'Perfection in the short term', 'Competition with others', 'a'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          arbeitszeit: '45 minutes (combined paper)',
          fieldId: 'write1',
          task:
            'Writing Part 1\nWrite an email to your friend (about 100 words).\n\nYour friend Mia sent you this email:\n\nHi!\nThanks for telling me about your new fitness class. It sounds fun! I want to start exercising too, but I\'m not sure whether to join a gym or a running club. What do you think I should do? Also, are the classes expensive?\n\nLove,\nMia\n\nWrite your email to Mia. In your email you should:\n- thank her for her message\n- answer her questions\n- make a suggestion about what she could try first',
          minWords: 100,
          criteria: ['Thank her for her message', 'Answer both questions', 'Make a clear suggestion', 'About 100 words'],
          modelAnswer:
            'Hi Mia,\n\nThanks for your email � I\'m glad you want to get started!\n\nIf you prefer meeting people, a running club might be better because it\'s social and you can go at your own speed. The gym is fine too, but it can feel busy. My class costs eight pounds a session, though some places offer cheaper trial weeks.\n\nWhy don\'t you come with me next Tuesday? You could see if you enjoy it before you decide.\n\nLove,\nAlex',
          feedback: ['Email format with greeting and sign-off', 'All three content points', 'PET linking and advice language'],
        },
        {
          aufgabe: 2,
          arbeitszeit: '45 minutes (combined paper)',
          fieldId: 'write2',
          task:
            'Writing Part 2\nWrite about 100 words. Choose one of these tasks.\n\nOption A � Article\nWrite an article for your school website about how students can stay healthy during exam time.\n\nOption B � Story\nWrite a story that begins with this sentence:\n"I had never tried rock climbing before that Saturday."\n\nInclude interesting details and a clear ending.',
          minWords: 100,
          criteria: ['Choose article OR story', 'About 100 words', 'Correct register for the task', 'Clear organisation'],
          modelAnswer:
            'OPTION A � Article:\n\nStaying Healthy During Exams\n\nExam season can be stressful, but small habits help. First, try to sleep at least seven hours � late-night revision is less effective than people think. Second, take short walks between study sessions. Fresh air clears your head. Finally, eat regular meals instead of snacking on sweets. Many students in our school also meet for a quick football game on Fridays, which helps them relax. If you plan your time, you can work hard and look after yourself.\n\n---\n\nOPTION B � Story:\n\nI had never tried rock climbing before that Saturday. My friend Lena booked a beginner session at the indoor wall near the river. I was nervous because I don\'t like heights, but the instructor explained everything clearly. On my third climb, I reached the top and shouted down to Lena. I couldn\'t believe it. Afterwards we were tired but proud, and we celebrated with smoothies. Now I go every month, and I\'m not afraid anymore.',
          feedback: ['Two model answers provided', 'Article: informative tone', 'Story: past narrative with ending'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Extended interview',
          dauer: '2-3 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1\nThe examiner will ask you questions about health, sport and wellbeing.\nGive extended answers with reasons and examples.',
          points: [
            'How often do you exercise and what activities do you do?',
            'What are the benefits of doing sport, in your opinion?',
            'Have you ever had an injury or health problem related to sport? What happened?',
            'Do you think technology helps people stay healthy? Why or why not?',
            'What would you like to change about your lifestyle?',
            'Is it easier to be healthy now than in the past? Why?',
          ],
          minExchanges: 6,
          modelAnswer:
            'Examiner: How often do you exercise and what activities do you do?\nMe: I try to exercise three times a week. I usually go swimming and I play basketball with friends on Saturdays.\nExaminer: What are the benefits of doing sport, in your opinion?\nMe: Well, it helps me sleep better and I feel less stressed after training. I also meet people, which is good for my mood.\nExaminer: Have you ever had an injury related to sport?\nMe: Yes, I hurt my ankle playing football last year. I had to rest for a month, but physiotherapy helped a lot.\nExaminer: Do you think technology helps people stay healthy?\nMe: Sometimes. Apps can remind you to move, but I think people worry too much about numbers on a screen.\nExaminer: What would you like to change about your lifestyle?\nMe: I\'d like to cook more instead of buying fast food when I\'m busy.\nExaminer: Is it easier to be healthy now than in the past?\nMe: In some ways yes, because we have more information, but we also sit at desks for hours, so it depends.',
          feedback: ['Extended answers with reasons', 'PET tenses and phrasal verbs', 'Six topics covered'],
        },
        {
          teil: 2,
          title: 'Collaborative task',
          dauer: '3-4 minutes',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2\nYour school wants to offer a new wellbeing activity for students.\nLook at the options below and discuss them together. Then decide which one activity you would choose.\n\nOptions:\n- A weekly yoga class after school\n- A healthy cooking workshop\n- A walking group in the local park\n- A short talk series on sleep and stress',
          points: [
            'Say what you like and dislike about each option',
            'Compare the options (cost, time, who would enjoy them)',
            'Agree or disagree with your partner\'s ideas',
            'Decide together on the best option and explain why',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: Which option do you think is best?\nMe: I think the walking group is the best choice because it\'s free and anyone can join, even beginners.\nExaminer: But the cooking workshop might help students eat better at home.\nMe: That\'s true, although ingredients could be expensive. Walking is simpler and people get fresh air.\nExaminer: I\'m not sure yoga would attract many students.\nMe: Right, some people find it boring. A talk on sleep could be useful, but talks alone don\'t make you active.\nExaminer: So you prefer walking?\nMe: Yes, and maybe we could combine it with short tips about sleep at the end.\nExaminer: OK, let\'s choose the walking group with optional short talks.\nMe: Perfect � that way we include wellbeing and exercise.',
          feedback: ['Agreement and disagreement', 'Decision reached together', 'Minimum five exchanges'],
        },
      ],
    };
  }

  function buildB2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'B2',
      topic: 'Technology and Society',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'B2 First (FCE)',
        note: 'Sample exam (Demo). Format based on the official Cambridge B2 First (FCE).',
      },
      modules: {
        lesen: { title: 'Reading', time: '45 minutes' },
        horen: { title: 'Listening', time: 'approx. 40 minutes' },
        schreiben: { title: 'Writing', time: '45 minutes' },
        sprechen: { title: 'Speaking', time: '14 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          instruction:
            'Reading and Use of English Part 1\nFor questions 1-8, read the text below and decide which answer (A, B, C or D) best fits each gap.\nThere is an example at the beginning (0).',
          textTitle: 'Technology in everyday life',
          text:
            'Digital tools were once praised for (0) ______ human connection across continents. Today, many commentators argue they have become a double-edged sword. While collaboration platforms have (1) ______ productivity for distributed teams, employees also report burnout from being permanently online.\n\nParents frequently (2) ______ about children\'s screen time, yet schools increasingly (3) ______ on educational apps for homework and assessment. The question is no longer whether technology belongs in classrooms, but how its use should be (4) ______.\n\nGovernments, meanwhile, are under pressure to (5) ______ up privacy legislation written before cloud storage existed. Without reform, personal data may continue to be (6) ______ across borders with minimal oversight. Without public pressure, firms rarely (7) ______ responsibility when automated systems cause harm. As several journalists have pointed out, convenience must not (8) ______ public accountability.\n\n(Example 0: B - fostering)',
          questions: [
            mc4('r1', '1  Gap 1', 'cut', 'boosted', 'delayed', 'limited', 'B'),
            mc4('r2', '2  Gap 2', 'agree', 'dream', 'worry', 'hear', 'C'),
            mc4('r3', '3  Gap 3', 'take', 'rely', 'look', 'get', 'B'),
            mc4('r4', '4  Gap 4', 'regulated', 'downloaded', 'forgotten', 'exported', 'A'),
            mc4('r5', '5  Gap 5', 'draw', 'hand', 'shut', 'break', 'A'),
            mc4('r6', '6  Gap 6', 'mined', 'posted', 'folded', 'typed', 'A'),
            mc4('r7', '7  Gap 7', 'take', 'accept', 'deny', 'avoid', 'A'),
            mc4('r8', '8  Gap 8', 'undermine', 'underline', 'undertake', 'overlook', 'A'),
          ],
        },
        {
          teil: 2,
          instruction:
            'Reading and Use of English Part 2\nYou are going to read an article about public Wi-Fi in cities. Six paragraphs have been removed from the article.\nChoose from the paragraphs A-G the one which fits each gap (1-6).\nThere is one extra paragraph which you do not need to use.',
          textTitle: 'How cities are rethinking public Wi-Fi',
          text:
            'When Barcelona launched free municipal Wi-Fi in 2018, officials predicted it would narrow the digital divide. Nearly a decade later, the picture is more complicated.\n\n(1) _______________________________\n\nEarly adopters celebrated instant connectivity, but urban planners soon noticed unintended consequences. Public hotspots attracted not only students and tourists, but also organised groups running scams.\n\n(2) _______________________________\n\nSecurity specialists urged councils to treat open networks like public spaces: useful, but requiring clear rules. Encryption alone, they argued, would not stop social engineering.\n\n(3) _______________________________\n\nBy 2023, several districts had piloted "smart benches" with time-limited access and automatic content filters. Usage data, anonymised and published quarterly, suggested evenings were peak hours.\n\n(4) _______________________________\n\nCritics claimed filters amounted to censorship. Supporters countered that libraries had always restricted material inappropriate for children.\n\n(5) _______________________________\n\nMeanwhile, community groups demanded ownership models in which residents co-design policies rather than accept vendor contracts drafted abroad.\n\n(6) _______________________________\n\nToday, the debate mirrors wider questions about technology and society: who benefits, who pays, and who is heard when infrastructure is built?',
          ads: [
            { key: 'A', title: 'Paragraph A', text: 'However, uptake varied sharply between neighbourhoods with high disposable income and those where families shared a single device.' },
            { key: 'B', title: 'Paragraph B', text: 'In response, the city council commissioned an independent audit and paused new installations until safeguards were agreed.' },
            { key: 'C', title: 'Paragraph C', text: 'Such measures, proponents insisted, were not anti-innovation; they were an attempt to keep public goods trustworthy.' },
            { key: 'D', title: 'Paragraph D', text: 'One facilitator described the process as "slow democracy" � messy, but preferable to corporate goodwill.' },
            { key: 'E', title: 'Paragraph E', text: 'Nevertheless, merchants reported increased footfall near hotspots, suggesting economic as well as social benefits.' },
            { key: 'F', title: 'Paragraph F', text: 'Pilot schemes therefore introduced time limits and filters while publishing anonymised data to reassure civil liberties groups.' },
            { key: 'G', title: 'Paragraph G', text: 'Rural councils in Scotland, by contrast, focused on fibre cables rather than urban hotspots, citing different demographic needs.' },
          ],
          questions: [
            matchOpt('r9', '9  Gap 1', 'A'),
            matchOpt('r10', '10  Gap 2', 'B'),
            matchOpt('r11', '11  Gap 3', 'F'),
            matchOpt('r12', '12  Gap 4', 'C'),
            matchOpt('r13', '13  Gap 5', 'D'),
            matchOpt('r14', '14  Gap 6', 'E'),
          ],
        },
        {
          teil: 3,
          instruction:
            'Reading Part 3\nFor questions 15-20, choose the answer (A, B, C or D) which you think fits best according to the text.',
          textTitle: 'The attention economy: can democracy survive the scroll?',
          text:
            'For more than a decade, social media platforms have insisted they are neutral pipes through which citizens exchange information. That claim, never entirely convincing, has been harder to sustain since whistle-blowers revealed how recommendation algorithms prioritise emotionally charged content. The result, according to a recent parliamentary inquiry, is not merely distraction but the systematic amplification of outrage.\n\nJournalists have adapted unevenly. Some newsrooms now employ "engagement editors" tasked with maximising clicks, while others have retreated behind paywalls to protect in-depth reporting. Freelance writer Amira Chen argues that the split has created a two-tier public sphere: fast, free and often misleading; slow, expensive and frequently ignored. "If citizens cannot agree on basic facts," she wrote last month, "debate becomes performance."\n\nGovernments have responded with proposals ranging from transparency reports to outright bans on targeted political advertising. Tech firms counter that regulation could stifle innovation and push harmful content onto encrypted channels regulators cannot see. Both sides, oddly, appeal to the language of protection � of children, of elections, of free expression � which makes compromise politically fraught.\n\nNot all researchers are pessimistic. Dr Leo Hartmann, who studies online civic behaviour, points out that mobilisation around climate action and mutual aid surged during the pandemic, largely organised through platforms critics love to hate. "The problem," he suggests, "is not connectivity itself but business models that reward permanence of attention over quality of discourse." Hartmann advocates public funding for non-profit platforms, though he admits scaling such projects would require patience voters may not possess.\n\nMeanwhile, schools are revising media literacy curricula to include prompt engineering and source verification. Parents, overwhelmed by constant notifications, experiment with household "phone hotels" � baskets where devices sleep during meals. These micro-policies will not reverse global trends, but they hint at a society learning, slowly, to treat technology as a tool rather than a fate.\n\nThe deeper question is whether democratic institutions can reform quickly enough. Elections still run on cycles measured in years; software updates arrive weekly. Until that mismatch is addressed, citizens will continue scrolling past problems their representatives swear they take seriously � a disconnect that no filter, however smart, is likely to remove.',
          questions: [
            mc4('r15', '15  What does the writer suggest about platforms\' claim to neutrality?', 'It was always widely accepted', 'It has become less credible after recent revelations', 'It was disproved before social media existed', 'It applies only to encrypted channels', 'B'),
            mc4('r16', '16  Amira Chen\'s main concern is that', 'paywalls have eliminated all free news', 'people disagree because reporting is too slow', 'misinformation prevents meaningful public debate', 'engagement editors no longer exist', 'C'),
            mc4('r17', '17  What point does the writer make about proposed regulation?', 'Both supporters and opponents frame it as protective', 'Tech firms welcome all government intervention', 'Bans on advertising have already succeeded everywhere', 'Journalists unanimously oppose transparency reports', 'A'),
            mc4('r18', '18  Dr Hartmann would agree that', 'connectivity has never helped civic causes', 'attention-driven business models distort public discourse', 'non-profit platforms are impossible to fund', 'critics exaggerate pandemic mobilisation', 'B'),
            mc4('r19', '19  The phrase "phone hotels" implies that families are', 'destroying devices permanently', 'creating temporary device-free periods', 'renting phones to neighbours', 'storing phones for security firms', 'B'),
            mc4('r20', '20  The writer\'s attitude in the final paragraph is best described as', 'cheerful about rapid institutional reform', 'concerned about a structural timing problem', 'indifferent to electoral politics', 'convinced that filters will solve the issue', 'B'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nFor each question, choose the correct answer.\nYou will hear three different extracts. For questions 1-6, choose the answer which fits best according to what you hear.',
          segments: [
            {
              label: 'Extract 1: Podcast on digital habits',
              transcript:
                'I wouldn\'t say social media is evil � I mean, it\'s kept me in touch with friends abroad. But honestly, I\'ve started noticing how often I pick up my phone without thinking. These days I switch off notifications after eight pm and take one screen-free day a week. It\'s not a perfect solution, but I feel less drained.',
              questions: [
                mc('l1', '1  What is the speaker\'s overall attitude to social media?', 'Entirely negative', 'Generally balanced but self-critical', 'Completely enthusiastic', 'b'),
                mc('l2', '2  What does the speaker recommend?', 'Deleting every online account', 'Setting boundaries on phone use', 'Buying newer devices', 'b'),
              ],
            },
            {
              label: 'Extract 2: Colleagues discuss new software',
              transcript:
                'A: So, are you looking forward to the new CRM system?\nB: Well, I\'m not convinced yet. Nobody asked front-line staff what we actually need.\nA: Fair point, although the training sessions might help.\nB: Yeah, I\'ll give it a chance � I just wish we\'d been consulted earlier, that\'s all.',
              questions: [
                mc('l3', '3  How does the man feel about the new system?', 'Fully confident it will succeed', 'Doubtful but willing to try', 'Determined to refuse using it', 'b'),
                mc('l4', '4  What criticism does he make?', 'The training is too expensive', 'Staff were not involved in planning', 'The software is outdated', 'b'),
              ],
            },
            {
              label: 'Extract 3: Privacy policy announcement',
              transcript:
                'Good morning. From next month, this organisation will require two-factor authentication on all work accounts. The change follows an external review which identified weak passwords as our greatest risk. Further details will be emailed today. If you have questions, contact IT before Friday. We appreciate your cooperation.',
              questions: [
                mc('l5', '5  What is the purpose of the announcement?', 'To advertise new hardware', 'To inform staff about a security change', 'To report a successful hack', 'b'),
                mc('l6', '6  What tone does the speaker adopt?', 'Casual and humorous', 'Formal and measured', 'Dismissive and impatient', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nFor questions 7-14, complete the sentences with a word, number or short phrase.\nYou will hear a talk about a technology conference.',
          context: 'A organiser describes an upcoming digital ethics conference.',
          transcript:
            'Hello everyone. I\'m pleased to outline plans for this year\'s Nexus Digital Ethics Conference, which will take place in Manchester on the ninth of November. We expect around four hundred and fifty delegates, including researchers, journalists and policy advisers. The opening keynote on artificial intelligence and employment law begins at ten fifteen in the Grand Hall. Standard tickets cost ninety-five pounds, although students pay half price if they register online. Optional workshops on data journalism run in the afternoon and must be booked separately. The exhibition area closes at six pm, but networking drinks continue until eight. Registration is open now at nexus-ethics dot org. We look forward to seeing you there.',
          notesTitle: 'Nexus Digital Ethics Conference',
          noteFields: [
            { id: 'l7', label: '7  City:', answer: 'Manchester' },
            { id: 'l8', label: '8  Date:', answer: '9 November' },
            { id: 'l9', label: '9  Expected number of delegates:', answer: '450' },
            { id: 'l10', label: '10  Time keynote starts:', answer: '10:15' },
            { id: 'l11', label: '11  Standard ticket price:', answer: '95 pounds' },
            { id: 'l12', label: '12  Afternoon workshops topic:', answer: 'data journalism' },
            { id: 'l13', label: '13  Time exhibition closes:', answer: '6' },
            { id: 'l14', label: '14  Website:', answer: 'nexus-ethics.org' },
          ],
        },
        {
          teil: 3,
          plays: 2,
          instruction:
            'Listening Part 3\nFor questions 15-19, choose from statements A-H which match each speaker\'s main point.\nUse each letter once. There are three extra statements you do not need.\n\nA  Schools need better teacher training before buying devices.\nB  Phones should not be used during lessons.\nC  Online learning works best when blended with face-to-face teaching.\nD  Parents are mainly positive about educational apps.\nE  Technology firms should fund school equipment.\nF  Coding should be compulsory from age seven.\nG  Social media distracts pupils more than games do.\nH  Budget cuts are the biggest obstacle to digital reform.',
          segments: [
            {
              label: 'Speaker 1',
              transcript:
                'Before we spend another penny on tablets, we ought to invest in teachers. I\'ve seen classrooms where the hardware gathers dust because staff haven\'t been trained. Without confidence, no app will transform learning.',
              questions: [matchOpt('l15', '15  Speaker 1', 'A')],
            },
            {
              label: 'Speaker 2',
              transcript:
                'Remote teaching during the pandemic proved that live video alone isn\'t enough. What worked was combining short online tasks with classroom discussion. Purely virtual lessons left many pupils behind.',
              questions: [matchOpt('l16', '16  Speaker 2', 'C')],
            },
            {
              label: 'Speaker 3',
              transcript:
                'If a phone is on the desk, attention disappears � it\'s that simple. I\'m not anti-technology; I use simulations in lessons. But personal messaging during class undermines everything we try to build.',
              questions: [matchOpt('l17', '17  Speaker 3', 'B')],
            },
            {
              label: 'Speaker 4',
              transcript:
                'People talk about shiny gadgets, but our IT budget was cut by thirty per cent last year. You cannot roll out innovation when you cannot maintain the Wi-Fi. Funding is the real bottleneck.',
              questions: [matchOpt('l18', '18  Speaker 4', 'H')],
            },
            {
              label: 'Speaker 5',
              transcript:
                'Digital literacy is no longer optional. I\'d make coding compulsory from primary school, not because every child will become a programmer, but because it teaches logical thinking early.',
              questions: [matchOpt('l19', '19  Speaker 5', 'F')],
            },
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Listening Part 4\nFor questions 20-26, choose the answer which fits best according to what you hear.\nYou will hear an interview with two guests debating AI regulation.',
          context: 'Radio interview: Should governments limit how companies deploy artificial intelligence?',
          transcript:
            'Interviewer: Tonight we\'re joined by policy analyst Grace Holt and entrepreneur Marco Silva. Grace, should AI be more tightly regulated?\nGrace: In critical areas like hiring and healthcare, absolutely. Without oversight, bias gets baked in and citizens cannot challenge decisions.\nMarco: I don\'t disagree in principle, but heavy rules could push innovation abroad. Start-ups simply don\'t have compliance teams.\nGrace: That argument assumes growth matters more than fairness. I\'d rather slow deployment than automate discrimination.\nMarco: Fair enough, though transparency requirements might achieve a lot without banning experiments outright.\nInterviewer: Marco, you seem to be suggesting a middle path.\nMarco: Yeah � mandatory impact assessments, public audits, that sort of thing. Blanket bans would hurt universities as much as firms.\nGrace: I could support that if penalties are meaningful. Voluntary codes haven\'t worked.\nInterviewer: Grace, do you trust industry self-regulation at all?\nGrace: Honestly? Not anymore. Too many firms treat ethics as marketing.\nMarco: Harsh, but I admit scandals have damaged trust. Customers are starting to ask questions, which helps.\nInterviewer: Where might consensus emerge?\nGrace: Around protecting vulnerable groups � children, gig workers, anyone without bargaining power.\nMarco: Agreed. And if Europe sets standards, others often follow, whether they admit it or not.',
          questions: [
            mc('l20', '20  What is Grace\'s main concern about unregulated AI?', 'It will reduce company profits', 'It may embed unfair decisions', 'It will eliminate all university research', 'b'),
            mc('l21', '21  Why is Marco worried about strict regulation?', 'It could drive innovation to other countries', 'It would ban all medical research', 'It has already failed in Europe', 'a'),
            mc('l22', '22  What does Grace imply about rapid deployment?', 'Speed is more important than fairness', 'Fairness should take priority over speed', 'Fairness is impossible to define', 'b'),
            mc('l23', '23  Marco\'s "middle path" includes', 'voluntary marketing campaigns', 'mandatory impact assessments', 'complete deregulation', 'b'),
            mc('l24', '24  What is Grace\'s attitude to voluntary codes?', 'She fully supports them', 'She believes they have failed', 'She has not heard of them', 'b'),
            mc('l25', '25  Marco admits that', 'customers never care about ethics', 'recent scandals have reduced trust', 'Europe never influences other regions', 'b'),
            mc('l26', '26  Both guests agree that protection should focus on', 'large shareholders', 'vulnerable groups', 'software developers only', 'b'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          fieldId: 'write1',
          task:
            'Writing Part 1 � Essay (compulsory)\nIn your English class you have been talking about technology and society. Now your teacher has asked you to write an essay.\n\nWrite an essay using all the notes and give reasons for your point of view.\n\n"Has social media improved the way people communicate?"\n\nWrite about:\n- staying in touch with friends who live far away\n- people spending less time talking face to face\n- ................ (your own idea)\n\nWrite your essay in 140-190 words.',
          minWords: 140,
          criteria: ['All notes and own idea', 'Balanced essay with opinion', '140-190 words', 'FCE register and linking'],
          modelAnswer:
            'Social media has undoubtedly changed how we communicate, though not always for the better. On the one hand, it allows us to stay in touch with friends who live far away instantly, sharing photos and news we would otherwise miss. That has strengthened many long-distance friendships.\n\nHowever, people often spend less time talking face to face, even when they are in the same room. Conversations can become superficial when everyone is checking notifications. In addition, misunderstandings spread quickly because tone is hard to read online.\n\nOverall, I believe social media has improved contact across distance, but it should not replace direct conversation. If we set boundaries � for example, phone-free meals � we can enjoy the benefits without losing genuine connection.',
          feedback: ['Introduction and conclusion', 'Both given ideas plus own point', 'Balanced FCE essay'],
        },
        {
          aufgabe: 2,
          fieldId: 'write2',
          task:
            'Writing Part 2\nWrite an answer to one of the questions 2-5 in this part. Write your answer in 140-190 words.\n\nQuestion 2 (Article): You see this announcement in an international technology magazine:\n"Write an article about how young people can use the internet safely."\n\nQuestion 3 (Review): Write a review of a website or app that helps people learn a skill.\n\nQuestion 4 (Report): Your college principal asked for a report on students\' opinions about online learning.\n\nQuestion 5 (Letter/Email): You received an email from a friend who wants to reduce their screen time. Write a reply.',
          minWords: 140,
          criteria: ['Choose one task type', 'Correct register for the genre', '140-190 words', 'Clear organisation'],
          modelAnswer:
            'QUESTION 2 � Article:\n\nStaying Safe Online: A Guide for Teenagers\n\nThe internet offers incredible opportunities, but it also carries risks young people should understand. First, protect personal information: avoid sharing locations or passwords, even with online friends. Second, think before posting � future employers may read what you write today. Third, question sensational headlines; check reliable sources before sharing news. Finally, tell a trusted adult if someone pressures you or sends inappropriate content. Digital skills are essential, yet safety habits matter just as much.\n\n---\n\nQUESTION 3 � Review:\n\nI recently tried SkillForge, an app that teaches basic coding through short daily challenges. The layout is clear, and the explanations are written in plain English rather than jargon. I especially liked the progress tracker, which motivated me to continue. On the downside, advanced modules require a subscription, and offline access is limited. Overall, SkillForge is an engaging starting point for beginners, though serious learners may outgrow it quickly.\n\n---\n\nQUESTION 4 � Report:\n\nIntroduction: This report summarises students\' views on online learning.\n\nFindings: Most students valued flexibility, especially when commuting. However, many reported difficulty concentrating at home and missed informal contact with classmates. Technical problems during live sessions were common.\n\nConclusion: Online learning works best when combined with occasional face-to-face meetings.\n\n---\n\nQUESTION 5 � Email:\n\nHi Sam,\n\nThanks for your message. I totally understand wanting to cut screen time � I\'ve been trying the same thing. Maybe you could start with small rules, like no phone during meals. You asked whether deleting apps helps; in my case, removing social media for a week made a big difference. Why don\'t we meet for a walk this Saturday instead of gaming online?\n\nBest,\nAlex',
          feedback: ['Four model answers provided', 'Genre-appropriate tone', '140-190 words each'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Interview',
          dauer: '2 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1 � Interview\nThe examiner will ask you questions about yourself and your opinions on technology and society.',
          points: [
            'How often do you use social media, and what for?',
            'Have you ever bought something online that disappointed you? What happened?',
            'Do you think children should learn coding at school? Why or why not?',
            'How has technology changed the way people work in your country?',
            'What apps or devices could you not live without?',
            'Do you think people spend too much time on their phones? Give examples.',
          ],
          minExchanges: 6,
          modelAnswer:
            'Examiner: How often do you use social media?\nMe: I check it several times a day, mainly to message friends and read news, though I\'m trying to reduce that.\nExaminer: Have you ever bought something online that disappointed you?\nMe: Yes, a pair of headphones that looked great in photos but arrived damaged. Returning them was quite frustrating.\nExaminer: Should children learn coding at school?\nMe: I think so, because it develops problem-solving skills, even if they don\'t become programmers.\nExaminer: How has technology changed work in your country?\nMe: Remote meetings have become normal, which saves commuting time but can blur boundaries between work and home.\nExaminer: What devices could you not live without?\nMe: Probably my laptop, since I use it for study, work and entertainment.\nExaminer: Do people spend too much time on phones?\nMe: Often yes � I\'ve noticed friends scrolling during conversations, which feels rude even if it\'s common.',
          feedback: ['Extended personal answers', 'FCE fluency and range', 'Six topics covered'],
        },
        {
          teil: 2,
          title: 'Long turn',
          dauer: '1 minute per candidate',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2 � Long turn\nCandidate A: Compare the two pictures and say how the people might be feeling about technology.\nCandidate B: Short question about the pictures.\nThen swap roles with a new pair of pictures about online shopping vs high-street shopping.',
          photoDescriptions: [
            'Photo A: A teenager wearing headphones, smiling while video-calling on a laptop at home.',
            'Photo B: An office worker rubbing their eyes in front of multiple glowing screens late at night.',
            'Photo C: A customer scanning a QR code to pay in a modern shop.',
            'Photo D: An elderly person being helped by a shop assistant at a traditional market stall.',
          ],
          points: ['Compare both pictures', 'Speculate about feelings and attitudes', 'Answer the follow-up question'],
          minWords: 60,
          modelAnswer:
            'Both pictures show people using technology, but the mood seems different. In the first, the teenager looks relaxed and happy, perhaps enjoying contact with friends online. In contrast, the office worker appears tired and stressed, which might suggest that being constantly connected can be exhausting. While technology can support social life, it can also create pressure to stay available. Follow-up: I\'d probably prefer the teenager\'s situation, as long as I could switch off when needed.',
          feedback: ['Comparison language', 'Speculation modals', 'Clear one-minute structure'],
        },
        {
          teil: 3,
          title: 'Collaborative task',
          dauer: '3 minutes',
          fieldId: 'speak3',
          situation:
            'Speaking Part 3 � Collaborative task\nYour class is planning a "Digital Wellbeing Week". Talk together about the options below and decide which two activities would be most effective.\n\nOptions:\n- Guest talk by a psychologist on sleep and screens\n- Daily phone-free lunch breaks\n- Workshop on spotting fake news\n- Competition to design posters about online safety\n- Peer mentoring for younger students\n- Survey of students\' screen-time habits',
          points: [
            'Discuss advantages and disadvantages of each option',
            'Speculate about what students would actually take part in',
            'Agree on two activities and explain why',
          ],
          minExchanges: 5,
          modelAnswer:
            'Me: I think the fake news workshop would be practical because students share articles all the time.\nPartner: True, though a psychologist\'s talk might make more people rethink late-night scrolling.\nMe: Maybe, but talks can be forgotten quickly. Phone-free lunches are simple and visible.\nPartner: I\'m not sure everyone would respect that rule.\nMe: We could combine the workshop with peer mentoring � older students could explain scams to younger ones.\nPartner: Good idea. Posters are creative, but they might be ignored.\nMe: So shall we choose the workshop and peer mentoring?\nPartner: Yes, they\'re interactive and could have a lasting impact.\nMe: Agreed � let\'s propose those two.',
          feedback: ['Speculation and comparison', 'Negotiation and decision', 'Minimum five exchanges'],
        },
        {
          teil: 4,
          title: 'Discussion',
          dauer: '4 minutes',
          fieldId: 'speak4',
          situation:
            'Speaking Part 4 � Discussion\nAnswer questions about technology and society linked to the collaborative task in Part 3.',
          points: [
            'Should schools ban mobile phones completely?',
            'Who is responsible for teaching online safety � parents or teachers?',
            'Will artificial intelligence create more jobs than it destroys?',
            'Is privacy still possible in the digital age?',
            'How might social media change in the next ten years?',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: Should schools ban phones completely?\nMe: Not completely � they can be useful for research, but they should be restricted during lessons.\nExaminer: Who should teach online safety?\nMe: Both parents and teachers, because risks appear at home as well as at school.\nExaminer: Will AI create more jobs than it destroys?\nMe: It will replace some roles, but new ones will appear if governments invest in retraining.\nExaminer: Is privacy still possible?\nMe: Only if users read settings carefully and laws are enforced; otherwise companies collect huge amounts of data.\nExaminer: How might social media change?\nMe: I think users will demand more control over algorithms, and video content will continue to dominate.',
          feedback: ['Extended discussion answers', 'Abstract vocabulary FCE', 'Linked to Part 3 theme'],
        },
      ],
    };
  }

  function buildC1() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'C1',
      topic: 'The Arts, Culture and Creativity',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'C1 Advanced (CAE)',
        note: 'Sample exam (Demo). Format based on the official Cambridge C1 Advanced (CAE).',
      },
      modules: {
        lesen: { title: 'Reading', time: '56 minutes' },
        horen: { title: 'Listening', time: 'approx. 40 minutes' },
        schreiben: { title: 'Writing', time: '90 minutes' },
        sprechen: { title: 'Speaking', time: '15 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          instruction:
            'Reading and Use of English Part 1\nFor questions 1-8, read the text below and decide which answer (A, B, C or D) best fits each gap.\nThere is an example at the beginning (0).',
          textTitle: 'The uneasy patronage of contemporary art',
          text:
            'Public galleries were once expected to (0) ______ canonical works for posterity. Today, many directors argue their role is to provoke debate, albeit at the risk of alienating donors. When a recent installation was accused of being deliberately opaque, the curator insisted that difficulty was not an affectation but a means of (1) ______ audiences from passive consumption.\n\nNotwithstanding record attendance at blockbuster shows, smaller venues report (2) ______ funding and rising overhead costs. Some municipalities have chosen to (3) ______ grants to community-led projects, while others remain (4) ______ committed to flagship institutions whose reputations, they claim, (5) ______ on international touring revenue.\n\nCritics, meanwhile, remain (6) ______ about corporate sponsorship, which is (7) ______ benign yet frequently shapes programming by stealth. Whether such compromises can be squared with artistic independence continues to (8) ______ on unresolved questions of public trust.\n\n(Example 0: B - safeguard)',
          questions: [
            mc4('r1', '1  Gap 1', 'wean', 'galvanise', 'placate', 'deter', 'A'),
            mc4('r2', '2  Gap 2', 'burgeoning', 'shrinking', 'stagnant', 'guaranteed', 'B'),
            mc4('r3', '3  Gap 3', 'earmark', 'forfeit', 'revoke', 'scatter', 'A'),
            mc4('r4', '4  Gap 4', 'lukewarmly', 'tentatively', 'fervently', 'grudgingly', 'C'),
            mc4('r5', '5  Gap 5', 'hinge', 'impinge', 'dwell', 'trade', 'A'),
            mc4('r6', '6  Gap 6', 'sanguine', 'ambivalent', 'oblivious', 'derisive', 'B'),
            mc4('r7', '7  Gap 7', 'ostensibly', 'perpetually', 'scarcely', 'uniformly', 'A'),
            mc4('r8', '8  Gap 8', 'founder', 'hinge', 'capitulate', 'relinquish', 'B'),
          ],
        },
        {
          teil: 2,
          instruction:
            'Reading and Use of English Part 2\nYou are going to read an article about cultural policy. Six paragraphs have been removed.\nChoose from the paragraphs A-G the one which fits each gap (1-6).\nThere is one extra paragraph which you do not need to use.',
          textTitle: 'Who owns creativity in the age of remix culture?',
          text:
            'When the National Gallery announced a digital archive allowing users to remix canonical paintings, the response was swift and polarised. Advocates hailed democratised creativity; traditionalists warned that context would be stripped away. What seemed a technical upgrade reopened a perennial quarrel about authorship.\n\n(1) _______________________________\n\nHistorically, museums positioned themselves as custodians rather than participants. Their authority derived from conservation expertise and scholarly interpretation, not from competing with artists. Remix platforms, by contrast, invite visitors to become producers overnight.\n\n(2) _______________________________\n\nLegal teams were quick to note that copyright clearance for derivative works remains labyrinthine. Even when images enter the public domain, moral rights and trademark disputes can still constrain reuse. Institutions therefore proceed cautiously, notwithstanding public demand for frictionless access.\n\n(3) _______________________________\n\nSome educators argue that remixing teaches visual literacy more effectively than passive viewing. Students who juxtapose disparate works must articulate why a combination succeeds or fails. Nevertheless, critics question whether playful pastiche equates to critical understanding.\n\n(4) _______________________________\n\nCommercial platforms have been less scrupulous. Fashion houses and advertisers routinely mine museum collections for aesthetic capital, often without acknowledging source communities. This asymmetry has fuelled accusations of cultural extraction dressed up as homage.\n\n(5) _______________________________\n\nCommunity representatives increasingly insist on co-governance models in which originating cultures help set terms of display and reuse. Such arrangements are administratively demanding, yet proponents maintain they restore legitimacy to institutions whose collections were assembled during eras of unequal power.\n\n(6) _______________________________\n\nUltimately, the debate is less about file formats than about who may speak for a work once it leaves the studio. If museums wish to remain relevant, they may need to accept that creativity is no longer a sequence ending in the vitrine, but a conversation continuing long afterwards.',
          ads: [
            { key: 'A', title: 'Paragraph A', text: 'Pilot programmes in secondary schools reported higher engagement when pupils were asked to remix portraits under guided prompts rather than copy them faithfully.' },
            { key: 'B', title: 'Paragraph B', text: 'These developments unsettle a hierarchy that, until recently, appeared settled: the institution interprets; the public receives.' },
            { key: 'C', title: 'Paragraph C', text: 'One curator described the shift as moving from "gatekeeping to gardening" - cultivating conditions in which new work could emerge without predetermining its form.' },
            { key: 'D', title: 'Paragraph D', text: 'In several high-profile cases, indigenous artists successfully renegotiated exhibition labels and licensing terms after sustained public campaigns.' },
            { key: 'E', title: 'Paragraph E', text: 'A recent audit found that three-quarters of blockbuster exhibitions relied on sponsorship from sectors with no prior involvement in the arts.' },
            { key: 'F', title: 'Paragraph F', text: 'Lawyers cautioned that viral remixes could expose museums to liability if offensive juxtapositions were perceived as institutional endorsements.' },
            { key: 'G', title: 'Paragraph G', text: 'Rural theatre companies, meanwhile, struggled to secure broadband speeds sufficient for streaming performances during winter tours.' },
          ],
          questions: [
            matchOpt('r9', '9  Gap 1', 'B'),
            matchOpt('r10', '10  Gap 2', 'F'),
            matchOpt('r11', '11  Gap 3', 'A'),
            matchOpt('r12', '12  Gap 4', 'E'),
            matchOpt('r13', '13  Gap 5', 'D'),
            matchOpt('r14', '14  Gap 6', 'C'),
          ],
        },
        {
          teil: 3,
          instruction:
            'Reading Part 3\nFor questions 15-20, choose the answer (A, B, C or D) which you think fits best according to the text.',
          textTitle: 'The performance of authenticity: live music in an algorithmic age',
          text:
            'Last summer, a veteran folk singer paused mid-set to berate an audience member whose phone glow had persisted through a ballad. The clip circulated widely, prompting predictable op-eds about manners. Less remarked upon was what the incident revealed: live performance now competes not only with recordings but with the audience\'s urge to mediate experience for absent followers.\n\nPromoters, ever attentive to metrics, have begun to treat social visibility as part of the ticket price. Backstage riders occasionally specify "Instagram moments" - curated lighting cues designed to photograph well. Purists dismiss such concessions as cynical, yet venues facing insolvency argue they are merely adapting to how value is now measured. The irony, albeit an uncomfortable one, is that authenticity has itself become a marketable aesthetic.\n\nMusicians respond variously. Some ban phones outright, risking accusations of nostalgia for an era that was never as attentive as memory suggests. Others lean into hybrid formats, live-streaming gigs while insisting that physical presence still matters. Dr Elena Marsh, who studies audience behaviour, notes that split attention does not necessarily imply indifference: many listeners use devices to archive moments they fear will evaporate. Nevertheless, she warns that when every song becomes content, performers may unconsciously shorten emotional arcs to suit clip-friendly pacing.\n\nThe algorithmic layer complicates matters further. Playlists shaped by streaming data encourage artists to replicate proven moods, potentially homogenising repertoire. Festival bookers, armed with demographic dashboards, may favour acts whose online engagement graphs spike predictably. Critics contend that such optimisation sidelines experimental musicians whose appeal accumulates slowly. Defenders counter that data simply makes obscure talent discoverable, notwithstanding the power of platform gatekeepers.\n\nWhat remains unclear is whether live music can recover its former status as a communal ritual rather than a personalised feed. A recent survey found that younger attendees still rated "atmosphere" above audio fidelity, suggesting desire for collective experience persists. Whether institutions can nurture that desire without reducing it to spectacle is an open question - one that no amount of trending hashtags is likely to settle definitively.',
          questions: [
            mc4('r15', '15  The writer\'s purpose in the opening paragraph is mainly to', 'criticise a specific fan for rudeness', 'use an incident to introduce a wider cultural shift', 'argue that folk music is outdated', 'defend the use of phones at concerts', 'B'),
            mc4('r16', '16  What does the writer imply about "authenticity" in paragraph 2?', 'It has been entirely destroyed by social media', 'It is now deliberately packaged for commercial ends', 'Venues no longer care about financial survival', 'Purists dominate festival programming', 'B'),
            mc4('r17', '17  Dr Marsh would most likely agree that', 'phone use always proves listeners are bored', 'recording a concert necessarily ruins its meaning', 'device use can coexist with genuine emotional investment', 'performers should avoid all hybrid formats', 'C'),
            mc4('r18', '18  The word "homogenising" in paragraph 4 suggests that algorithms may', 'encourage greater musical diversity', 'make different acts sound increasingly similar', 'eliminate all obscure artists immediately', 'replace live performance entirely', 'B'),
            mc4('r19', '19  Which view does the writer appear to find more persuasive?', 'Critics who blame platform gatekeepers exclusively', 'Defenders who claim data only benefits discovery', 'Neither side, as both oversimplify a complex issue', 'Promoters who prioritise Instagram moments', 'C'),
            mc4('r20', '20  The tone of the final paragraph is best described as', 'triumphant about the future of live music', 'cautiously uncertain about possible solutions', 'dismissive of younger audiences', 'angry towards streaming companies', 'B'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nYou will hear three different extracts. For questions 1-6, choose the answer which fits best according to what you hear.',
          segments: [
            {
              label: 'Extract 1: Gallery director on a podcast',
              transcript:
                'Look, I\'m not pretending every show we mount will be universally adored. Our last contemporary installation baffled plenty of visitors, and frankly that was partly the point. If art only reaffirms what we already believe, it ceases to be art and becomes decoration. That said, we\'ve been criticised for prioritising controversy over accessibility, and I\'d be lying if I said that criticism hasn\'t kept me awake. Still, I\'d rather defend a difficult programme than programme by committee and end up with wallpaper.',
              questions: [
                mc('l1', '1  What is the speaker\'s attitude to the recent installation?', 'Regretful that it was mounted at all', 'Defensive but willing to accept some criticism', 'Indifferent to public reaction', 'b'),
                mc('l2', '2  What does the speaker imply about "programme by committee"?', 'It produces safe, uninspiring results', 'It is the only democratic approach', 'It guarantees financial success', 'a'),
              ],
            },
            {
              label: 'Extract 2: Two colleagues after a theatre review',
              transcript:
                'A: Did you read Patel\'s review of the revival?\nB: I did. Harsh, but not entirely unfair, I suppose.\nA: Harsh? She practically accused the director of cynicism.\nB: Well, the second act does lean on shock value. Still, I think she overlooked what they were trying to say about grief.\nA: So you\'d recommend it?\nB: With reservations. It\'s flawed, but I\'d rather see an ambitious failure than another polished nothing.',
              questions: [
                mc('l3', '3  How does speaker B feel about the production overall?', 'It is flawless and misunderstood', 'It has merit despite significant flaws', 'It should close immediately', 'b'),
                mc('l4', '4  What criticism does speaker B accept?', 'The review ignored the play entirely', 'The production relies somewhat on shock', 'The director lacked any clear intention', 'b'),
              ],
            },
            {
              label: 'Extract 3: Announcement at a literary festival',
              transcript:
                'Good afternoon. Owing to unforeseen travel disruption, this evening\'s keynote conversation with Professor Lang will begin at seven forty-five rather than seven fifteen. The signing session has been cancelled, but ticket holders may submit questions in writing at the information desk. We apologise for the inconvenience and appreciate your patience. The panel on translated fiction will proceed as scheduled in Hall Two.',
              questions: [
                mc('l5', '5  What change has been announced?', 'The keynote will start later and the signing is off', 'The entire festival has been cancelled', 'Professor Lang will not appear at all', 'a'),
                mc('l6', '6  What is the speaker\'s tone?', 'Casual and amused', 'Formal and apologetic', 'Angry towards the audience', 'b'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nFor questions 7-14, complete the sentences with a word, number or short phrase.\nYou will hear a curator describing plans for a new arts centre.',
          context: 'A project director outlines the Riverside Creative Hub.',
          transcript:
            'Thank you for joining this briefing on the Riverside Creative Hub, due to open in September next year. The building will occupy a converted warehouse beside the old docks, offering two hundred and forty square metres of flexible studio space. Resident artists will receive eighteen-month fellowships, funded jointly by the city council and a private foundation. Public workshops on printmaking and digital sculpture are scheduled for weekday evenings, though weekend sessions will focus on family programmes. Admission to the ground-floor gallery will remain free, while ticketed performances in the black-box theatre will subsidise outreach work in schools. The inaugural exhibition, entitled "Borrowed Light", will feature twelve international photographers exploring themes of migration and memory. Volunteers are being recruited now, and training begins on the fifth of March. Further details are available at riversidecreativehub dot org.',
          notesTitle: 'Riverside Creative Hub � Notes',
          noteFields: [
            { id: 'l7', label: '7  Opening month:', answer: 'September' },
            { id: 'l8', label: '8  Size of studio space:', answer: '240 square metres' },
            { id: 'l9', label: '9  Length of fellowships:', answer: '18 months' },
            { id: 'l10', label: '10  Weekend sessions focus on:', answer: 'family programmes' },
            { id: 'l11', label: '11  Title of inaugural exhibition:', answer: 'Borrowed Light' },
            { id: 'l12', label: '12  Number of photographers featured:', answer: '12' },
            { id: 'l13', label: '13  Date volunteer training begins:', answer: '5 March' },
            { id: 'l14', label: '14  Website:', answer: 'riversidecreativehub.org' },
          ],
        },
        {
          teil: 3,
          plays: 2,
          instruction:
            'Listening Part 3\nFor questions 15-19, choose from statements A-H which match each speaker\'s main point.\nUse each letter once. There are three extra statements you do not need.\n\nA  Creativity should not be reduced to measurable economic output.\nB  Traditional craft skills deserve protected status.\nC  Artists have a duty to challenge political complacency.\nD  Digital tools have democratised access to making art.\nE  Cultural funding should prioritise regional venues over capital cities.\nF  Collaboration across disciplines produces the most innovative work.\nG  Audiences are becoming less willing to engage with ambiguous work.\nH  Corporate sponsorship inevitably compromises artistic integrity.',
          segments: [
            {
              label: 'Speaker 1',
              transcript:
                'I\'m tired of hearing that a play\'s worth can be counted in ticket sales and caf� receipts. If we only fund what fills seats, we\'ll end up with endless revivals and nothing that unsettles us. Culture isn\'t a productivity metric.',
              questions: [matchOpt('l15', '15  Speaker 1', 'A')],
            },
            {
              label: 'Speaker 2',
              transcript:
                'When I started weaving, my grandmother\'s techniques were dismissed as hobbyism. Now designers pay a premium for hand-finished textiles. We need formal recognition before these skills disappear altogether.',
              questions: [matchOpt('l16', '16  Speaker 2', 'B')],
            },
            {
              label: 'Speaker 3',
              transcript:
                'Open-source software and affordable tablets mean a teenager in a small town can compose, edit and publish work that once required a studio budget. That doesn\'t guarantee quality, but it changes who gets heard.',
              questions: [matchOpt('l17', '17  Speaker 3', 'D')],
            },
            {
              label: 'Speaker 4',
              transcript:
                'Our last production merged choreography with architectural projection. Neither discipline would have arrived there alone. The friction between fields is where genuinely new forms emerge.',
              questions: [matchOpt('l18', '18  Speaker 4', 'F')],
            },
            {
              label: 'Speaker 5',
              transcript:
                'Sponsors attach strings - sometimes literally, with logo placement dictating content. I\'ve turned down projects rather than soften a message to suit a brand\'s risk committee.',
              questions: [matchOpt('l19', '19  Speaker 5', 'H')],
            },
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Listening Part 4\nFor questions 20-26, choose the answer which fits best according to what you hear.\nYou will hear a discussion about arts education in schools.',
          context: 'Radio discussion with a head teacher and a concert pianist.',
          transcript:
            'Presenter: Is arts education a luxury or a necessity?\nHead teacher Ms Cole: Necessity, though I\'d concede it\'s often treated as optional when budgets tighten. Music and drama develop confidence and empathy - skills employers claim they want, ironically, while cutting the subjects that cultivate them.\nPianist Mr Okonkwo: I\'d go further. Without early exposure, children assume creativity belongs to a talented few. That myth narrows aspiration.\nPresenter: Ms Cole, do you share that concern?\nMs Cole: Absolutely, albeit we struggle to recruit specialist staff. If a school can\'t hire a music teacher, the curriculum becomes tokenistic - an occasional workshop rather than sustained practice.\nMr Okonkwo: And yet digital resources could supplement, not replace, skilled instruction.\nMs Cole: Supplement, yes, but a video cannot respond to a child\'s hesitation the way a teacher can.\nPresenter: Mr Okonkwo, are you optimistic about policy?\nMr Okonkwo: Cautiously. Recent rhetoric emphasises "creative industries", which risks framing arts purely as economic pipelines. Nevertheless, any recognition helps.\nPresenter: Final question: should assessment focus on technique or expression?\nMr Okonkwo: Both, though expression without technique can become self-indulgent.\nMs Cole: And technique without expression produces anxious perfectionists. Balance is everything, but balance requires time we seldom grant.',
          questions: [
            mc('l20', '20  What is Ms Cole\'s main argument?', 'Arts subjects are economically useless', 'Arts education develops skills employers value', 'Employers actively fund school arts programmes', 'b'),
            mc('l21', '21  What does Mr Okonkwo suggest about talent?', 'It is evenly distributed at birth', 'The idea that creativity is rare limits children', 'Only gifted pupils should study music', 'b'),
            mc('l22', '22  What problem does Ms Cole identify?', 'Digital resources have solved staffing shortages', 'Without specialists, arts provision becomes superficial', 'Workshops are preferable to regular lessons', 'b'),
            mc('l23', '23  What is Mr Okonkwo\'s attitude to recent policy rhetoric?', 'Wholly dismissive', 'Guardedly hopeful despite reservations', 'Entirely enthusiastic', 'b'),
            mc('l24', '24  What implied criticism does Mr Okonkwo make of "creative industries" framing?', 'It may reduce arts to economic utility', 'It gives too much power to teachers', 'It eliminates the need for technique', 'a'),
            mc('l25', '25  On assessment, the two guests largely agree that', 'only technique should be marked', 'expression matters more than skill', 'technique and expression both matter', 'c'),
            mc('l26', '26  Ms Cole\'s final remark suggests schools', 'rarely allow enough time for balanced arts teaching', 'should abolish perfectionist standards', 'have excessive funding for arts', 'a'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          fieldId: 'write1',
          task:
            'Writing Part 1 � Essay (compulsory)\nWrite an essay discussing two of the points below and adding a third point of your own.\n\n"Some people believe governments should spend more public money on the arts. Others think funding should be directed towards science and technology instead."\n\nWrite about:\n- the role of the arts in shaping national identity\n- economic arguments for investing in creative industries\n- ................ (your own idea)\n\nWrite your essay in 220-260 words.',
          minWords: 220,
          criteria: ['Two given points plus own idea', 'Balanced critical argument', 'Clear position and conclusion', '220-260 words'],
          modelAnswer:
            'Public spending on the arts is frequently framed as a luxury, yet this dichotomy with science and technology is itself misleading. The arts contribute to national identity not by freezing tradition in aspic, but by enabling societies to narrate change. Commemorative theatre, public sculpture and literature in translation all help citizens interpret shared history, albeit contentiously. Without such spaces for reflection, political discourse narrows to utilitarian slogans.\n\nEconomic arguments also carry weight. Creative industries generate employment and export revenue, particularly when cities cultivate distinctive cultural brands. Nevertheless, funding decisions should not treat artists solely as growth assets; doing so risks privileging market-friendly work over experimental practice.\n\nA third consideration is wellbeing. Participation in music, drama and visual arts correlates with improved mental health and social cohesion, outcomes that reduce pressure on other public services. If governments neglect these benefits, they may save modest sums upfront while incurring larger costs later.\n\nOn balance, I would argue for sustained arts funding alongside investment in science, since both enrich public life in complementary ways. The question is not which sector deserves survival, but whether policymakers can recognise culture as essential infrastructure rather than ornamental expenditure.',
          feedback: ['Abstract CAE essay structure', 'Hedging and discourse markers', '220-260 words'],
        },
        {
          aufgabe: 2,
          fieldId: 'write2',
          task:
            'Writing Part 2\nWrite one of the following in 220-260 words.\n\nQuestion 2 � Letter/Email (formal)\nYou recently attended a concert at a city venue where the acoustics and staff conduct were unacceptable. Write a formal letter of complaint to the venue manager.\n\nQuestion 3 � Proposal\nYour local council is considering closing a community arts centre. Write a proposal explaining why the centre should remain open and suggesting improvements.\n\nQuestion 4 � Report\nYour college principal has asked for a report on students\' participation in cultural activities. Write a report with findings and recommendations.\n\nQuestion 5 � Review\nWrite a review of a novel, exhibition or performance you have experienced recently, for a culture website.',
          minWords: 220,
          criteria: ['Choose one task type', 'Appropriate formal/informal register', '220-260 words', 'Sophisticated vocabulary'],
          modelAnswer:
            'QUESTION 2 � Formal letter:\n\nDear Ms Thornton,\n\nI am writing to express my dissatisfaction following a performance at Riverside Hall on 14 April. Although the programme was promising, the acoustic balance rendered the string section inaudible for much of the first half. Repeated feedback from neighbouring patrons was met with indifference by front-of-house staff, one of whom suggested we "sit closer" despite seats being sold as unreserved.\n\nGiven the ticket price, such conditions were unacceptable. I therefore request a partial refund and assurance that technical checks will be conducted before future concerts. I would welcome a written response within fourteen days.\n\nYours faithfully,\nDaniel Reyes\n\n---\n\nQUESTION 3 � Proposal:\n\nIntroduction: This proposal argues that Mill Lane Arts Centre should remain open.\n\nCurrent value: The centre provides affordable studio space and weekly workshops attended by residents of all ages.\n\nProposed improvements: Partner with schools to offer evening classes; apply for matched funding to upgrade digital equipment.\n\nConclusion: Closure would remove a rare inclusive venue; modest investment could increase sustainability.\n\n---\n\nQUESTION 4 � Report:\n\nPurpose: To assess student participation in cultural activities.\n\nFindings: While drama membership is strong, attendance at gallery visits is declining, partly due to transport costs.\n\nRecommendations: Subsidise travel; schedule events outside examination periods.\n\n---\n\nQUESTION 5 � Review:\n\nElena Varga\'s new installation, "Silent Archives", transforms discarded letters into suspended paper corridors that whisper when visitors pass. The effect is elegiac rather than sentimental, inviting reflection on what cultures choose to remember. Occasionally the sound design feels overwrought, yet the work remains a poignant meditation on memory and loss. Recommended for patient viewers willing to slow down.',
          feedback: ['Four sophisticated model answers', 'Register matched to genre', '220-260 words each'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Interview',
          dauer: '2 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1 � Interview\nThe examiner will ask you questions about yourself and your experiences of arts and culture.',
          points: [
            'How important is creativity in your everyday life?',
            'Can you describe a cultural event that made a strong impression on you?',
            'Do you think access to the arts is equal in your country? Why or why not?',
            'How has digital technology changed the way you consume culture?',
            'Would you ever consider a career in the arts? Why or why not?',
            'What role should schools play in developing creativity?',
          ],
          minExchanges: 6,
          modelAnswer:
            'Examiner: How important is creativity in your everyday life?\nMe: Quite important - I cook experimentally and occasionally write poetry, which helps me process stress.\nExaminer: Describe a cultural event that impressed you.\nMe: I saw a contemporary dance piece that used silence as deliberately as music; it stayed with me for weeks.\nExaminer: Is access to the arts equal?\nMe: Not really. Capital cities dominate funding, whereas regional venues struggle to survive.\nExaminer: How has technology changed consumption?\nMe: I stream concerts I could never attend in person, though I worry it replaces rather than supplements live experience.\nExaminer: Would you consider an arts career?\nMe: I\'d find it fulfilling but financially precarious, which makes me hesitate.\nExaminer: What role should schools play?\nMe: They should treat creativity as core, not extracurricular, so pupils learn to think flexibly.',
          feedback: ['Extended nuanced answers', 'CAE fluency and range', 'Six topics'],
        },
        {
          teil: 2,
          title: 'Long turn',
          dauer: '1 minute per candidate',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2 � Long turn\nCompare and contrast two photographs showing people engaging with culture.\nSpeculate about what the people might be thinking and what the images suggest about modern creativity.',
          photoDescriptions: [
            'Photo A: An elderly man sketching in a quiet museum gallery, surrounded by classical sculptures.',
            'Photo B: A group of teenagers filming a short dance sequence on phones in a graffiti-covered underpass.',
            'Photo C: A conductor rehearsing an orchestra in a grand concert hall.',
            'Photo D: A solitary writer editing manuscript pages in a crowded caf�, wearing headphones.',
          ],
          points: ['Compare both pictures', 'Speculate about thoughts and context', 'Discuss implications for creativity today'],
          minWords: 80,
          modelAnswer:
            'Both photographs depict creative engagement, yet the settings suggest contrasting relationships to tradition. The elderly man appears absorbed in direct observation, perhaps translating centuries-old forms into personal study, whereas the teenagers are producing content for immediate sharing, which might imply a desire for visibility as much as expression. I would speculate that he values contemplation, while they prioritise collaboration and audience. Nevertheless, neither scene is inherently more authentic; they simply reflect different ecologies of creativity in contemporary culture.',
          feedback: ['Speculation and comparison', 'Abstract vocabulary', 'One-minute structured turn'],
        },
        {
          teil: 3,
          title: 'Collaborative task',
          dauer: '3 minutes',
          fieldId: 'speak3',
          situation:
            'Speaking Part 3 � Collaborative task\nYour city is designing a new "Creativity Quarter". Discuss these options and decide which two should receive priority funding.\n\nOptions:\n- A museum of digital interactive art\n- Affordable studio space for local artists\n- Free outdoor performance programme\n- Artist-in-residence scheme in schools\n- Archive preserving endangered crafts\n- Night-time gallery openings aimed at young professionals',
          points: [
            'Discuss cultural and social impact of each option',
            'Speculate about long-term consequences',
            'Agree on two priorities and justify your decision',
          ],
          minExchanges: 5,
          modelAnswer:
            'Me: I\'d prioritise affordable studios because rising rents are pushing artists out of the city centre.\nPartner: True, though the school residency scheme could nurture future audiences.\nMe: Perhaps, but studios address an immediate crisis; without space, artists cannot produce work for schools to enjoy.\nPartner: What about the outdoor performance programme? It\'s visible and inclusive.\nMe: It is, but weather dependence makes it unreliable. An archive of crafts feels vital too, yet benefits fewer people directly.\nPartner: So studios plus residencies?\nMe: Yes - production and education together. We could revisit outdoor events later.\nPartner: Agreed. That balances sustainability with outreach.',
          feedback: ['Speculation and negotiation', 'Ethical/cultural reasoning', 'Decision with justification'],
        },
        {
          teil: 4,
          title: 'Discussion',
          dauer: '4 minutes',
          fieldId: 'speak4',
          situation:
            'Speaking Part 4 � Discussion\nDiscuss questions related to arts funding, cultural identity and creativity in the digital age.',
          points: [
            'Should controversial art be publicly funded even if it offends some citizens?',
            'Can culture ever be truly global, or is it always local?',
            'What ethical issues arise when museums display artefacts acquired colonially?',
            'If artificial intelligence generates art, who should be considered the artist?',
            'How might creativity be valued differently in twenty years\' time?',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: Should controversial art receive public funding?\nMe: In principle yes, provided there is transparent accountability; offence alone shouldn\'t veto funding, though hate speech must remain excluded.\nExaminer: Can culture be truly global?\nMe: Forms travel globally, but meanings remain rooted in context; globalisation often homogenises surface styles while deeper references stay local.\nExaminer: What about colonial artefacts?\nMe: Institutions must negotiate restitution seriously rather than hide behind legal technicalities.\nExaminer: Who is the artist if AI generates work?\nMe: Likely the human who designs prompts and curates output, though copyright law hasn\'t caught up.\nExaminer: How might creativity be valued in twenty years?\nMe: Perhaps less as rare genius and more as collaborative literacy, albeit economic precarity may persist unless policy changes.',
          feedback: ['Hypothetical and ethical reasoning', 'Nuanced CAE discussion', 'Linked to Part 3 theme'],
        },
      ],
    };
  }

  function buildC2() {
    return {
      demo: true,
      goetheFormat: true,
      lang: 'en',
      level: 'C2',
      topic: 'Language, Memory and Human Experience',
      official: {
        board: 'Cambridge Assessment English',
        certificate: 'C2 Proficiency (CPE)',
        note: 'Sample exam (Demo). Format based on the official Cambridge C2 Proficiency (CPE).',
      },
      modules: {
        lesen: { title: 'Reading', time: '60 minutes' },
        horen: { title: 'Listening', time: 'approx. 40 minutes' },
        schreiben: { title: 'Writing', time: '90 minutes' },
        sprechen: { title: 'Speaking', time: '16 minutes' },
      },
      lesenParts: [
        {
          teil: 1,
          instruction:
            'Reading and Use of English Part 1\nFor questions 1-8, read the text below and decide which answer (A, B, C or D) best fits each gap.\nThere is an example at the beginning (0).',
          textTitle: 'The unreliable archive of the self',
          text:
            'The discovery did not so much overturn prior theory as cast (0) ______ on its tidy narratives. Neuroscientists had long treated memory as a ledger; new imaging suggested something closer to montage, albeit one that feels seamless to the rememberer.\n\nWhen eyewitness testimony was (1) ______ in court, judges demanded corroboration, notwithstanding popular faith in vivid recall. The gap between feeling certain and being accurate remains, for many lay observers, counterintuitive.\n\nLiterary memoirs, (2) ______, trade on the prestige of intimate revelation, yet editors quietly (3) ______ passages whose veracity cannot be verified. The reader, none the wiser, receives a past polished into prose.\n\nSome philosophers argue that autobiographical memory is less retrieval than reconstruction � a view that has (4) ______ traction among clinicians treating trauma. Others resist, fearing it (5) ______ responsibility for harmful acts.\n\nWhat persists is a paradox: we narrate ourselves into coherence, even when coherence (6) ______ the record. Language, in that sense, is not merely descriptive; it is constitutive. To remember, we must misremember a little, lest experience remain mere (7) ______, however seductive the lure of (8) ______.\n\n(Example 0: A � doubt)',
          questions: [
            mc4('r1', '1  Gap 1', 'discredited', 'admitted', 'invoked', 'canvassed', 'C'),
            mc4('r2', '2  Gap 2', 'meanwhile', 'nevertheless', 'for instance', 'by contrast', 'D'),
            mc4('r3', '3  Gap 3', 'excise', 'embellish', 'fabricate', 'transpose', 'A'),
            mc4('r4', '4  Gap 4', 'gained', 'forfeited', 'circumvented', 'relinquished', 'A'),
            mc4('r5', '5  Gap 5', 'abrogates', 'undermines', 'exonerates', 'consolidates', 'B'),
            mc4('r6', '6  Gap 6', 'elides', 'corroborates', 'distorts', 'archives', 'A'),
            mc4('r7', '7  Gap 7', 'flux', 'residue', 'incident', 'chronicle', 'A'),
            mc4('r8', '8  Gap 8', 'rhetoric', 'ephemera', 'certitude', 'pedantry', 'C'),
          ],
        },
        {
          teil: 2,
          instruction:
            'Reading and Use of English Part 2\nYou are going to read an essay about memory and identity. Six paragraphs have been removed.\nChoose from the paragraphs A-G the one which fits each gap (1-6).\nThere is one extra paragraph which you do not need to use.',
          textTitle: 'What we keep when we forget',
          text:
            'Childhood rooms persist in the mind with suspicious clarity: the angle of light, the smell of dust warmed by radiators, a voice calling from another corridor. Such scenes feel archived intact, yet psychologists insist they are revised each time they are summoned. Memory, in this account, is less vault than workshop, where materials are trimmed, glued and repainted until they fit the story currently under construction. We return to these rooms not as curators but as restless editors, surprised each time the furniture has shifted slightly.\n\n(1) _______________________________\n\nThis unsettling idea has migrated from laboratories into novels and films, where unreliable narrators flourish and readers take pleasure in detecting the seams. Writers who once feared being accused of invention now signal it openly, as though honesty lay in confessing the artifice rather than in reproducing the past. Readers who once demanded factual fidelity now savour ambiguity, provided it is artfully signalled rather than smuggled in as documentary truth. The cultural shift is not merely aesthetic; it reflects a broader scepticism toward any single authoritative version of the past, whether offered by a parent at dinner, a politician at a podium, or a historian in footnotes. Even personal diaries, once treated as private ledgers, are now read with the wary eye we bring to memoir.\n\n(2) _______________________________\n\nFamilies, meanwhile, rehearse their histories at tables and funerals, smoothing contradictions into shared plots that can be retold without rupture. Siblings recall the same quarrel with incompatible details, each convinced the other confuses imagination with truth, yet neither willing to surrender the moral advantage their version affords. These disputes are seldom resolved by evidence; they are absorbed into lore, becoming the very texture of belonging. To challenge a family story is often mistaken for disloyalty, as though affection required acquiescence in a single script. Anthropologists have documented similar dynamics in diaspora communities, where remembered hardship binds generations who never experienced it directly.\n\n(3) _______________________________\n\nLanguage accelerates the process. A parent\'s offhand phrase � "you were always difficult" � can become, through repetition, a biography that the child later performs without examining its provenance. Children who hear such verdicts early may grow into adults who enact them, not from destiny but from narrative suggestion, mistaking a sentence for a fate. Teachers, coaches and therapists likewise supply labels that stick: gifted, fragile, disruptive. Once spoken often enough, these words function as memory\'s scaffolding, determining which episodes seem typical and which appear anomalous enough to be forgotten. The lexicon of a household thus shapes its archive as surely as any filing system.\n\n(4) _______________________________\n\nNot all forgetting is failure. Trauma survivors sometimes describe merciful gaps, as though the mind withholds what consciousness cannot yet bear, offering respite rather than negligence. Therapists walk a narrow line between excavating pain and respecting protective silence, knowing that premature narration can fix distress in place. Courts, impatient for coherent testimony, seldom tolerate such nuance, yet clinical practice has long recognised that recall arrives on its own schedule or not at all. To insist on completeness may be less a quest for truth than a demand for legibility.\n\n(5) _______________________________\n\nDigital storage promises permanence while producing new fragilities: obsolete formats, corrupted files, platforms that vanish overnight when venture capital moves on. We backup photographs yet lose the contexts that made them meaningful � the joke that prompted a smile, the argument that preceded a departure. The cloud, for all its metaphors of elevation, is still a human arrangement, subject to politics and profit, to terms of service no one reads and to mergers that swallow collections whole. Future historians may inherit vast data without the interpretive keys required to read it, much as we inherit letters in languages no living speaker can parse.\n\n(6) _______________________________\n\nPerhaps human experience has never depended on perfect recall, but on the stories we consent to live inside � stories editable, fallible, and nonetheless ours. Identity, in this light, is less a pearl discovered than a pattern maintained: fragile, revisable, yet binding while it holds. Forgetting, far from betraying us, may be the condition that allows experience to become bearable narrative rather than inchoate surplus. What we keep when we forget is not the event in its entirety, but the meaning we can carry without being crushed by it.',
          ads: [
            { key: 'A', title: 'Paragraph A', text: 'Neuroimaging studies suggest that recalling an event can alter its neural trace, making the next recollection subtly different.' },
            { key: 'B', title: 'Paragraph B', text: 'Historians have long understood that archives are curated, yet private memory was somehow exempt from similar scrutiny until recently.' },
            { key: 'C', title: 'Paragraph C', text: 'Some clinicians warn that pressing patients to narrate trauma prematurely can re-inscribe harm rather than relieve it.' },
            { key: 'D', title: 'Paragraph D', text: 'A cousin\'s wedding, described differently by three relatives, becomes less a record than a referendum on loyalty.' },
            { key: 'E', title: 'Paragraph E', text: 'Critics of memoir culture note that confession sells, even when confession outruns recollection.' },
            { key: 'F', title: 'Paragraph F', text: 'The metaphor of storage misleads: brains do not file experiences like documents in drawers awaiting retrieval.' },
            { key: 'G', title: 'Paragraph G', text: 'Urban planners debating tram routes seldom consider how commuters narrate their journeys to themselves each morning.' },
          ],
          questions: [
            matchOpt('r9', '9  Gap 1', 'F'),
            matchOpt('r10', '10  Gap 2', 'B'),
            matchOpt('r11', '11  Gap 3', 'D'),
            matchOpt('r12', '12  Gap 4', 'E'),
            matchOpt('r13', '13  Gap 5', 'C'),
            matchOpt('r14', '14  Gap 6', 'A'),
          ],
        },
        {
          teil: 3,
          instruction:
            'Reading Part 3\nFor questions 15-24, choose the answer (A, B, C or D) which you think fits best according to the texts.\nYou will read two texts on whether language shapes memory.',
          textTitle: 'Does language shape what we remember?',
          text:
            'TEXT A � Dr Helena Voss, cognitive linguist\n\nThose who insist memory precedes language mistake the medium for the message. Infants, it is true, register distress before they possess syntax, yet what survives into adulthood is already sculpted by the words available to interpret it. A culture with granular vocabulary for shades of regret will not remember events identically to one that collapses such feelings into generic sadness. This is not linguistic determinism in its crude form; it is an observation about framing. Each retelling selects detail, assigns motive, implies causality � operations language performs almost before we notice. When bilingual subjects recall the same episode in different languages, researchers routinely find shifts in emphasis, as though the self were a slightly altered character in translation. Skeptics protest that underlying facts remain, but facts unarticulated are inert; they enter social life only once named. The political stakes are seldom acknowledged. Commissions investigating atrocities struggle not merely over evidence but over lexicon: whether to speak of "conflict", "cleansing" or "genocide" is already to remember differently. To pretend otherwise is to indulge a fantasy of pre-linguistic innocence we never possessed. Consider, too, how legal systems codify permissible descriptions of harm, thereby shaping what can later be recalled without self-incrimination. Witnesses learn quickly which adjectives carry consequence. Even intimate memory is not exempt: couples argue not only over what happened but over the verbs adequate to it � whether a remark was "dismissive", "cruel" or merely "honest" can determine which episode becomes canonical. Neuroscience, for all its glamour, cannot rescue us from this predicament; scans may show activation but not the narrative that organises it for the remembering subject. My point is not that language fabricates ex nihilo, but that it supplies the categories through which experience becomes durable enough to guide action. Without such categories, the past would remain, if at all, a mute turbulence.\n\nTEXT B � Professor James Calder, philosopher of mind\n\nDr Voss conflates influence with constitution. Language undoubtedly colours recollection, much as lighting alters a stage, yet the play persists beneath the gel. Human memory evolved to track hazards and affiliations long before literary culture refined our descriptors. To claim that naming creates the remembered world is to confuse report with reality � a category error dressed in fashionable neuro-rhetoric. Bilingual shifts in emphasis prove little beyond the obvious: different idioms highlight different facets, as varied cameras might. The facet does not cease to exist when another lens is chosen. Moreover, excessive scepticism toward memory undermines moral life. If every narrative is mere reconstruction, accountability dissolves into interpretive games. Victims who testify require not epistemic pedantry but recognition that some events bruise the world whether or not language has yet found adequate verbs. I do not deny that words can distort; propaganda demonstrates that daily. I deny that distortion is memory\'s default condition. Silence, too, remembers � in muscle, in dream, in the hesitations that precede speech. Language serves experience; it does not author it. Voss treats lexicon as architect; I treat it as instrument. The difference matters when we counsel trauma survivors or evaluate testimony in court. To suggest that no episode exists until narrated is to insult those who know, bodily, what they endured before finding words. Yes, retelling reshapes emphasis; yes, translation shifts tone. Yet the constraint of reality remains: one cannot, merely by renaming, undo having been present at a catastrophe. Historical inquiry depends on this stubborn residue. Documents may lie, but not all lies are equally plausible against the grain of other evidence. My quarrel with Voss is therefore not political but conceptual. She underestimates the independence of experience from its description, and in doing so risks replacing one dogma � that memory mirrors events perfectly � with another: that memory is wholly linguistic artefact. Both extremes flatten a richer truth.',
          questions: [
            mc4('r15', '15  Dr Voss\'s main claim is that', 'memory exists independently of all language', 'language actively structures what is remembered', 'bilingualism prevents accurate recall', 'facts are irrelevant once forgotten', 'B'),
            mc4('r16', '16  The examples of commissions investigating atrocities are used to show', 'legal language has no effect on verdicts', 'terminology can shape collective memory', 'genocide is impossible to prove', 'Voss opposes all political inquiry', 'B'),
            mc4('r17', '17  Professor Calder would reject the view that', 'lighting affects how a stage appears', 'propaganda can distort public understanding', 'there is any role for language in recall', 'memory evolved before literary culture', 'C'),
            mc4('r18', '18  Calder\'s camera metaphor implies that', 'different descriptions reveal pre-existing aspects of events', 'memory is entirely invented by language', 'photography is more reliable than testimony', 'bilingual speakers cannot tell the truth', 'A'),
            mc4('r19', '19  What is Voss\'s likely attitude to Calder\'s concern about accountability?', 'She would dismiss it as irrelevant to linguistics', 'She might argue naming is already a moral act', 'She would agree memory is wholly pre-linguistic', 'She would deny any political role for language', 'B'),
            mc4('r20', '20  Calder\'s reference to "silence" suggests he believes', 'unspoken experience can still constitute memory', 'silence proves language is unnecessary for law', 'dreams are unreliable sources of evidence', 'victims should not testify publicly', 'A'),
            mc4('r21', '21  Both writers would probably agree that', 'language never influences recollection', 'memory is entirely accurate without words', 'propaganda can affect how events are understood', 'bilingualism eliminates moral responsibility', 'C'),
            mc4('r22', '22  Voss\'s tone in Text A is best described as', 'apologetic and hesitant', 'assertive and politically aware', 'dismissive of scientific research', 'playfully ironic throughout', 'B'),
            mc4('r23', '23  Calder\'s phrase "category error" implies Voss', 'has misclassified the relationship between language and memory', 'has discovered a new scientific method', 'denies the existence of bilingual speakers', 'refuses to read historical archives', 'A'),
            mc4('r24', '24  Which statement would Calder most likely endorse?', 'Naming an event is identical to inventing it', 'Some experiences constrain narrative even if language selects emphasis', 'Commissions should avoid precise vocabulary', 'Infants remember nothing before acquiring syntax', 'B'),
          ],
        },
      ],
      horenParts: [
        {
          teil: 1,
          plays: 2,
          instruction:
            'Listening Part 1\nYou will hear four short extracts. For questions 1-12, choose the answer which fits best according to what you hear.',
          segments: [
            {
              label: 'Extract 1: Literary critic on memoir',
              transcript:
                'I\'m wary of the current vogue for trauma memoirs, not because suffering shouldn\'t be spoken, but because the market rewards rehearsed revelation with advances, podcast tours and film options. When every chapter ends on an epiphany, I start to suspect editing has replaced remembering, and that the arc of redemption has been imposed where life offered only muddle. That isn\'t to deny genuine pain � merely to note that prose has a way of tidying what the mind leaves stubbornly untidy. The finest autobiographical writing acknowledges its own artifice; the weakest pretends that fluency equals fidelity.',
              questions: [
                mc('l1', '1  What is the speaker\'s attitude to trauma memoirs?', 'Outright rejection of all personal writing', 'Sceptical of commercial shaping of painful stories', 'Enthusiastic about predictable narrative arcs', 'b'),
                mc('l2', '2  What distinction does the speaker make?', 'Between genuine pain and market-driven presentation', 'Between fiction and journalism only', 'Between poetry and science', 'a'),
                mc('l3', '3  The speaker\'s tone is best described as', 'uncritically celebratory', 'measured but questioning', 'openly contemptuous of readers', 'b'),
              ],
            },
            {
              label: 'Extract 2: Two academics after a lecture',
              transcript:
                'A: So you\'re unconvinced by the "language creates memory" thesis?\nB: Unconvinced is too strong. I\'d say it overreaches. Language obviously frames recollection, but framing isn\'t fabrication.\nA: Yet bilingual subjects recall differently in laboratory settings.\nB: Of course � emphasis shifts, emotional colour changes. That doesn\'t erase the underlying episode, any more than describing a landscape in poetry abolishes the hill.\nA: Underlying in what sense? Accessible without words?\nB: Accessible, perhaps, though not always articulable. Which is not the same as non-existent. Some experiences resist narration without thereby becoming imaginary.',
              questions: [
                mc('l4', '4  Speaker B\'s position is that language', 'has no effect on memory at all', 'frames but does not wholly create memory', 'completely fabricates past events', 'b'),
                mc('l5', '5  How does B respond to bilingual evidence?', 'By denying such research exists', 'By accepting shifts in emphasis without rejecting a core event', 'By claiming bilinguals are unreliable witnesses', 'b'),
                mc('l6', '6  B\'s final remark suggests some experiences are', 'real though hard to express in words', 'imaginary if not narrated', 'legally invalid in court', 'a'),
              ],
            },
            {
              label: 'Extract 3: Radio presenter introducing a feature',
              transcript:
                'Tonight we explore why families quarrel over stories no camera recorded and no court would adjudicate. Our guest argues that shared memory is less archive than negotiation � siblings trading versions until one plot prevails, often the plot that preserves peace rather than precision. If that sounds bleak, she insists it\'s also how groups forge belonging across generations who were not present at the original scene. Not accuracy, perhaps, but affinity � and sometimes, she adds, affinity is what enables survivors to speak at all.',
              questions: [
                mc('l7', '7  What is the feature mainly about?', 'Technical advances in digital storage', 'Disputes over shared family narratives', 'Legal rules on eyewitness testimony', 'b'),
                mc('l8', '8  The guest\'s view of shared memory is that it', 'is an exact historical record', 'helps create group belonging despite inaccuracy', 'should be abandoned entirely', 'b'),
                mc('l9', '9  The presenter\'s tone could be called', 'neutral and informative', 'hostile toward the guest', 'dismissive of family life', 'a'),
              ],
            },
            {
              label: 'Extract 4: Therapist reflecting on practice',
              transcript:
                'Clients sometimes arrive demanding the one true version of their childhood, as though therapy were a tribunal with a single verdict. I have to explain, gently, that therapy isn\'t archaeology; we work with the stories that shape feeling, not with carbon dating. That doesn\'t mean inventing facts � it means acknowledging that memory serves present needs, and those needs can change as safety increases. When a narrative loosens its grip, relief often precedes any new certainty about what happened years ago.',
              questions: [
                mc('l10', '10  The speaker compares therapy to archaeology in order to', 'reject the idea of recovering a single objective past', 'prove childhood events are unknowable', 'promote deliberate fabrication', 'a'),
                mc('l11', '11  The speaker\'s approach implies memory is', 'functional for present emotional life', 'always deliberately false', 'irrelevant to treatment', 'a'),
                mc('l12', '12  The speaker\'s manner is', 'gentle but firm', 'sarcastic and impatient', 'detached and amused', 'a'),
              ],
            },
          ],
        },
        {
          teil: 2,
          plays: 2,
          instruction:
            'Listening Part 2\nFor questions 13-20, complete the sentences with a word, number or short phrase.\nYou will hear a lecture on digital memory archives.',
          context: 'A archivist discusses the Mnemos Project.',
          transcript:
            'Good evening. I am grateful to the Historical Memory Society for inviting me to outline the Mnemos Project, launched in twenty twenty-one, which aims to preserve oral histories from communities whose languages are under-documented and therefore vulnerable to quiet extinction. Our repository currently holds three thousand two hundred hours of recordings gathered across fourteen countries, though transcription, I must confess, lags considerably behind acquisition � a bottleneck we are addressing through volunteer training and semi-automated tools that remain, for now, imperfect. Participants retain moral rights over their narratives, meaning withdrawal requests must be honoured within thirty days, regardless of whether material has already been catalogued for research use. Last year we partnered with the Langfeld Institute to develop open-source metadata standards, thereby reducing vendor lock-in and ensuring that future archivists are not held hostage to proprietary software. Public access is tiered: scholars may stream files immediately, whereas general users encounter a six-month embargo to protect interviewees from unforeseen exposure in local press. Funding comes primarily from the Hartley Trust, covering sixty per cent of operating costs; the remainder is raised through competitive grants and, modestly, through membership fees. Our next exhibition, "Voices Without Scripts", opens on the fourteenth of October and will feature twelve newly digitised dialect collections, each accompanied by contextual essays written in collaboration with community elders. Volunteers fluent in at least two languages are still sought, particularly for languages with complex tonal systems. If you wish to contribute time or funding, enquiries should be directed to mnemos dot org slash join.',
          notesTitle: 'Mnemos Project � Lecture notes',
          noteFields: [
            { id: 'l13', label: '13  Year project launched:', answer: '2021' },
            { id: 'l14', label: '14  Hours of recordings held:', answer: '3200' },
            { id: 'l15', label: '15  Days allowed to honour withdrawal requests:', answer: '30' },
            { id: 'l16', label: '16  Partner institute:', answer: 'Langfeld Institute' },
            { id: 'l17', label: '17  Embargo for general users:', answer: '6 months' },
            { id: 'l18', label: '18  Percentage of costs covered by Hartley Trust:', answer: '60' },
            { id: 'l19', label: '19  Exhibition opening date:', answer: '14 October' },
            { id: 'l20', label: '20  Website path for enquiries:', answer: 'mnemos.org/join' },
          ],
        },
        {
          teil: 3,
          plays: 2,
          instruction:
            'Listening Part 3\nFor questions 21-25, choose from statements A-H which match each speaker\'s main point.\nUse each letter once. There are three extra statements you do not need.\n\nA  Forgetting can be a form of psychological protection.\nB  Digital backups create an illusion of permanence.\nC  Language mainly records memory without altering it.\nD  Shared stories matter more than factual precision in families.\nE  Eyewitness confidence is a poor guide to accuracy.\nF  Literary style can confer false authority on memory.\nG  Bilingualism produces entirely separate identities.\nH  Archives should exclude morally controversial testimony.',
          segments: [
            {
              label: 'Speaker 1',
              transcript:
                'After the accident, whole weeks were blank � not frightening, exactly, but absent, as though someone had removed the scaffolding on which ordinary days depend. My therapist said the gaps weren\'t laziness of mind; they were shelter, a provisional mercy I had not requested but gradually learned to accept. I\'ve stopped treating forgetting as failure, though others still speak of "moving on" as if memory were luggage one could simply abandon at the station.',
              questions: [matchOpt('l21', '21  Speaker 1', 'A')],
            },
            {
              label: 'Speaker 2',
              transcript:
                'We migrated photos to three clouds and still lost the captions � who took what, where, why, and whether anyone still wanted to remember. The files survived; the meanings didn\'t. Permanence, it turns out, is a sales pitch aimed at people who fear oblivion yet refuse to do the slow work of annotation. I now keep a notebook beside the hard drive, which feels absurd until the drive fails.',
              questions: [matchOpt('l22', '22  Speaker 2', 'B')],
            },
            {
              label: 'Speaker 3',
              transcript:
                'At reunions we argue dates, but honestly it\'s the plot we\'re defending � who was loyal, who vanished, who owes whom an apology deferred for decades. Accuracy would split the room. We prefer the story that keeps us talking, even if it means smoothing edges that, individually, we still feel sharply. Memory, in families, is diplomacy as much as record.',
              questions: [matchOpt('l23', '23  Speaker 3', 'D')],
            },
            {
              label: 'Speaker 4',
              transcript:
                'Elegant sentences persuade juries before facts do, especially when the witness weeps on cue and the barrister supplies a grammar of certainty. I\'ve seen witnesses utterly convinced of details contradicted by video, yet unwilling to revise because revision felt like betrayal of their own suffering. Confidence is theatre, not proof � a lesson courts learn slowly and painfully.',
              questions: [matchOpt('l24', '24  Speaker 4', 'E')],
            },
            {
              label: 'Speaker 5',
              transcript:
                'Memoir workshops teach cadence, metaphor, pacing � skills that lend inevitability to recall, as though life arrived pre-edited. Readers forget they\'re reading craft, not transcription, and authors, seduced by praise for their "honesty", may begin to believe the workshop version themselves. Style confers authority; that is its pleasure and its hazard.',
              questions: [matchOpt('l25', '25  Speaker 5', 'F')],
            },
          ],
        },
        {
          teil: 4,
          plays: 2,
          instruction:
            'Listening Part 4\nFor questions 26-31, choose the answer which fits best according to what you hear.\nYou will hear a debate on whether schools should teach memory skills.',
          context: 'Debate between an educational psychologist and a historian.',
          transcript:
            'Psychologist: Proposals to teach "memory literacy" in secondary schools sound benign, even overdue, yet I worry they smuggle in a debunking agenda at precisely the age when pupils are forming identity. If every lesson emphasises fallibility, they may conclude all recollection is suspect and retreat from trusting their own past.\nHistorian: I\'d argue the opposite: without training, they inherit myths wholesale � national, familial, digital. Teaching source criticism isn\'t cynicism; it\'s citizenship. Democracies that cannot distinguish anecdote from evidence are vulnerable to manipulation.\nPsychologist: Perhaps, but adolescents already dwell in environments engineered to erode attention. Adding scepticism could tip them into detachment rather than critical engagement, especially if overworked teachers deliver it as a checklist.\nHistorian: Detachment, in moderation, is preferable to uncritical certainty. Besides, memory skills include preserving voices � interviewing elders, cataloguing dialect, annotating photographs. Not everything is deconstruction; some of it is stewardship.\nPsychologist: Fair, though implementation matters. A module squeezed into an overcrowded timetable becomes performative. Pupils memorise slogans about false memory without practising careful listening.\nHistorian: Granted. Still, societies that venerate false clarity pay later � in miscarriages of justice, in polarised history wars. I\'d rather students learn nuance early, even at the cost of some comfort.\nPsychologist: Then we agree on nuance, if not on pace. Pilot programmes, rigorous evaluation, safeguards for vulnerable pupils � not ideological campaigns.\nHistorian: I can accept that compromise, albeit reluctantly. Comfort, as you say, is overrated in education, though I would not wish classrooms to become laboratories of suspicion. Balance, like memory itself, requires continual adjustment.',
          questions: [
            mc('l26', '26  The psychologist\'s initial concern is that memory literacy might', 'encourage blind trust in elders', 'undermine identity formation through excessive scepticism', 'eliminate all history teaching', 'b'),
            mc('l27', '27  The historian compares source criticism to', 'commercial advertising techniques', 'a form of civic responsibility', 'an alternative to reading literature', 'b'),
            mc('l28', '28  What underlies the psychologist\'s worry about "detachment"?', 'Students already face attention-disrupting environments', 'Schools lack any curriculum guidelines', 'Historians reject all oral testimony', 'a'),
            mc('l29', '29  The historian\'s reference to interviewing elders suggests memory education can', 'include constructive preservation as well as critique', 'replace all written archives', 'focus exclusively on debunking myths', 'a'),
            mc('l30', '30  By the end, the speakers largely', 'agree on cautious pilot programmes', 'reject any form of memory training', 'decide comfort is the primary educational goal', 'a'),
            mc('l31', '31  The historian\'s final remark about comfort is best understood as', 'sarcastic dismissal of the psychologist\'s position', 'ironic understatement accepting some discomfort is necessary', 'a literal praise of uncomfortable classrooms', 'b'),
          ],
        },
      ],
      schreibenParts: [
        {
          aufgabe: 1,
          fieldId: 'write1',
          task:
            'Writing Part 1 � Essay (compulsory)\nWrite an essay discussing a philosophical question related to the topic.\n\n"Is personal identity mainly a story we tell ourselves rather than a fixed inner essence?"\n\nWrite your essay in 240-280 words, with a clear structure, original examples and a distinctive authorial voice.',
          minWords: 240,
          criteria: ['Sophisticated argument', 'Original examples', 'Clear voice and conclusion', '240-280 words'],
          modelAnswer:
            'Identity, if it exists at all, behaves less like a pearl hidden inside the shell and more like the shell itself � layered, revised, occasionally cracked. We narrate continuity because discontinuity frightens us: the adolescent we no longer recognise, the grief that rearranges preference, the political conviction abandoned without ceremony. To call this narration mere fiction, however, would be as misleading as calling cartography mere drawing. Maps shape journeys.\n\nConsider bilingual lives. Speakers often report feeling subtly altered by language, not because another self lurks beneath, but because each lexicon highlights different obligations and regrets. The "fixed essence" model struggles to explain such elastic fidelity to experience.\n\nYet reductionism cuts both ways. If identity were only story, moral responsibility would dissolve into aesthetic choice � a conclusion few would accept when confronting deliberate harm. Even constructed selves must answer for actions embedded in others\' memories, whether or not those memories are perfectly preserved.\n\nI would argue, therefore, that identity is narrative without being arbitrary: a provisional coherence we maintain through language, revised under pressure of evidence and relationship. It is not discovered like a fossil but negotiated like a treaty � imperfect, revisable, and nonetheless binding while it holds.',
          feedback: ['Philosophical CPE essay', 'Literary register', '240-280 words'],
        },
        {
          aufgabe: 2,
          fieldId: 'write2',
          task:
            'Writing Part 2\nWrite one of the following in 240-280 words.\n\nQuestion 2 � Formal letter\nWrite to a publisher complaining that a memoir you purchased contains factual inaccuracies presented as lived experience, and requesting a published clarification.\n\nQuestion 3 � Article\nWrite for a quality magazine on whether digital archives help or hinder how societies remember.\n\nQuestion 4 � Review\nWrite a review of a novel that explores unreliable memory, evaluating its literary merits and thematic ambition.\n\nQuestion 5 � Report\nWrite a report for a university committee on students\' use of AI tools to summarise readings, with findings and recommendations.',
          minWords: 240,
          criteria: ['Genre-appropriate register', 'Stylistically accomplished prose', '240-280 words', 'Clear organisation'],
          modelAnswer:
            'QUESTION 2 � Formal letter:\n\nDear Sir or Madam,\n\nI write regarding Ms Lorna Pike\'s memoir "Glass Hours", purchased in good faith as autobiography. Several episodes depicted as childhood memory correspond closely to a short story published under the author\'s pen name in 2014, predating the events described. This overlap might be artistic licence, yet the cover makes no distinction between recollection and recomposition.\n\nI do not seek refund so much as clarification. Readers deserve to know when memoir merges with prior fiction. I therefore request a published erratum outlining which sections derive from earlier imaginative work.\n\nYours faithfully,\nMartin Ellison\n\n---\n\nQUESTION 3 � Article:\n\nWe assumed the cloud would remember for us. Instead, we have abundance without context � terabytes of faces divorced from names. Digital archives democratise preservation, certainly, yet they also tempt institutions to hoard data without interpretive labour. Memory, sociologists remind us, is social: it requires argument, ritual, forgetting. Uploading everything is not remembrance; it is deferral.\n\n---\n\nQUESTION 4 � Review:\n\nIn "The Second Room", Elena Marr treats amnesia not as plot twist but as moral condition. Her protagonist reconstructs a marriage from voicemails and disputed testimonies, each chapter doubling back on the last. Marr\'s prose is restrained, almost forensic, which makes her occasional lyrical ruptures devastating. If the novel falters, it is in its secondary characters, who exist chiefly as epistemological prompts. Nonetheless, Marr articulates the uneasy truth that love, too, is a narrative maintained jointly � and collapses when the versions diverge.\n\n---\n\nQUESTION 5 � Report:\n\nPurpose: To assess student use of AI summarisation tools.\n\nFindings: Usage is widespread, particularly for secondary reading; students report time savings but admit reduced retention.\n\nRecommendations: Integrate critical comparison tasks requiring evaluation of AI summaries against sources; offer workshops on scholarly note-taking.',
          feedback: ['Four C2 model texts', 'Distinctive voice per genre', '240-280 words'],
        },
      ],
      sprechenParts: [
        {
          teil: 1,
          title: 'Interview',
          dauer: '2 minutes',
          fieldId: 'speak1',
          situation:
            'Speaking Part 1 � Interview\nThe examiner will ask you about language, memory and experience in your own life.',
          points: [
            'Do you trust your earliest memories? Why or why not?',
            'Has learning another language changed how you think or remember?',
            'What role do photographs play in your personal history?',
            'Do families in your culture retell shared stories? With what effect?',
            'When has language failed to express something important to you?',
            'Do you think technology helps us remember more accurately?',
          ],
          minExchanges: 6,
          modelAnswer:
            'Examiner: Do you trust your earliest memories?\nMe: Only provisionally. They feel vivid, yet I\'ve noticed details shifting after conversations with relatives.\nExaminer: Has another language changed how you think?\nMe: Subtly, yes. In English I am more direct; in my first language I tolerate ambiguity I might otherwise avoid.\nExaminer: What role do photographs play?\nMe: They anchor narratives, though occasionally they replace the memory they were meant to support.\nExaminer: Do families retell shared stories?\nMe: Constantly � often to settle present disputes rather than preserve the past accurately.\nExaminer: When has language failed you?\nMe: During grief, when formulaic consolation felt obscene.\nExaminer: Does technology help accuracy?\nMe: It preserves data, not necessarily meaning; context still slips away.',
          feedback: ['Nuanced personal responses', 'CPE lexical range', 'Six topics'],
        },
        {
          teil: 2,
          title: 'Long turn',
          dauer: '1 minute per candidate',
          fieldId: 'speak2',
          situation:
            'Speaking Part 2 � Long turn\nCompare two abstract photographs: one showing an elderly person reading handwritten letters; another showing a young person scrolling through a social media feed labelled "Memories".\nSpeculate about what each person might be experiencing and what the images imply about remembering in different eras.',
          photoDescriptions: [
            'Photo A: An elderly woman at a kitchen table, reading faded handwritten letters by lamplight.',
            'Photo B: A teenager on a sofa, scrolling a phone screen titled "Memories" with curated photos.',
            'Photo C: A empty archive room with labelled boxes stretching into the distance.',
            'Photo D: A brain scan displayed on a monitor beside a notebook of patient testimonies.',
          ],
          points: ['Compare and speculate with hedging', 'Discuss implications for human experience', 'Use sophisticated vocabulary'],
          minWords: 90,
          modelAnswer:
            'Both images concern retrieval of the past, yet the textures differ markedly. The elderly reader appears immersed in material traces � ink, paper, perhaps loss � whereas the teenager encounters an algorithmically curated stream that may feel spontaneous while being designed. I would speculate that she negotiates absence directly, whereas he negotiates selection. Neither scene guarantees authenticity; both, however, suggest that remembering is never passive. If anything, the contrast implies that technology externalises curation while older forms embed it in ritual.',
          feedback: ['Abstract speculation', 'Hedging language', 'CPE comparison structures'],
        },
        {
          teil: 3,
          title: 'Collaborative task',
          dauer: '3 minutes',
          fieldId: 'speak3',
          situation:
            'Speaking Part 3 � Collaborative task\nA museum is planning an exhibition on "How We Remember". Discuss these proposals and decide which two would best help visitors reflect on memory\'s complexity.\n\nProposals:\n- Interactive booth where visitors edit a shared "family story"\n- Display of misidentified archival photographs\n- Workshop on interviewing elders\n- Installation on false memory experiments\n- Room of silenced testimonies with optional audio\n- VR reconstruction of a historical event from multiple viewpoints',
          points: [
            'Evaluate ethical and educational implications',
            'Speculate about emotional impact on visitors',
            'Agree on two proposals and justify your choice',
          ],
          minExchanges: 5,
          modelAnswer:
            'Me: I\'d prioritise the misidentified photographs � they expose how confidently we misread evidence.\nPartner: Disturbing, though perhaps the interview workshop balances that with constructive skill-building.\nMe: True, yet workshops demand time visitors may not have. The false memory installation is intellectually sharp, but could feel clinical.\nPartner: What about the silenced testimonies room?\nMe: Potentially powerful, albeit ethically delicate. VR reconstructions risk spectacle over nuance.\nPartner: So photographs plus testimonies?\nMe: Yes � one cognitive, one moral. Together they suggest memory\'s fragility and stakes.\nPartner: Agreed, provided content warnings are clear.',
          feedback: ['Ethical reasoning', 'Collaborative decision', 'CPE speculation'],
        },
        {
          teil: 4,
          title: 'Discussion',
          dauer: '4 minutes',
          fieldId: 'speak4',
          situation:
            'Speaking Part 4 � Discussion\nThe examiner will challenge your views on memory, language and identity. Defend or modify your positions when challenged.',
          points: [
            'If memory is reconstructed, can anyone truly know their past?',
            'Should legal systems rely less on eyewitness testimony?',
            'Is forgetting morally permissible, or a failure of responsibility?',
            'Does bilingualism divide the self or enrich it?',
            'Will AI-generated memoirs diminish the value of lived narrative?',
          ],
          minExchanges: 5,
          modelAnswer:
            'Examiner: If memory is reconstructed, can anyone know their past?\nMe: Know with certainty, no; know usefully, yes � much like history itself.\nExaminer: Should courts rely less on eyewitnesses?\nMe: They should treat confidence as insufficient, not dispense with testimony altogether.\nExaminer: Is forgetting permissible?\nMe: Sometimes necessary, though selective forgetting can also conceal harm.\nExaminer: Does bilingualism divide the self?\nMe: It multiplies perspective rather than splitting essence � though the experience can feel disorienting.\nExaminer: Will AI memoirs diminish lived narrative?\nMe: They may flood the market with plausible falsehoods, forcing readers to demand provenance � which might, paradoxically, sharpen critical reading.',
          feedback: ['Defends and modifies views', 'Handles challenge', 'CPE abstract debate'],
        },
      ],
    };
  }

  function buildLegacyFlat(level, topic) {
    return buildEn(level, topic, {
      lesenInstr: 'Reading Part 1\nRead the text and answer questions 1-4. For 3-4 mark T (True) or F (False).',
      lesen: {
        textTitle: 'Text: Healthy Habits',
        text:
          'More people today are trying to live healthier lives. Doctors recommend eating more vegetables and doing regular exercise. However, many office workers sit for long hours. Sleep is also important because it helps concentration and reduces stress.',
        questions: [
          mc('l1', 'Question 1. What do doctors recommend?', 'Less sleep', 'More vegetables', 'More sugar', 'b'),
          mc('l2', 'Question 2. Why is sleep important?', 'It helps concentration', 'It costs money', 'It stops exercise', 'a'),
          rf('l3', 'Question 3. All office workers go to the gym.', 'F'),
          rf('l4', 'Question 4. Small changes can help.', 'T'),
        ],
      },
      horenInstr: 'Listening Part 1\nYou will hear a conversation at the doctor. You will hear the recording twice.',
      horen: {
        context: 'Situation: A patient talking to a doctor.',
        transcript:
          'A: What seems to be the problem?\nB: I have had headaches for three days and I feel tired.\nA: Do you have a fever?\nB: No, but I sleep badly.\nA: Drink water and rest.',
        questions: [
          mc('h1', 'Question 5. How long has the patient had headaches?', 'One day', 'Three days', 'A week', 'b'),
          mc('h2', 'Question 6. What does the doctor suggest?', 'Rest and water', 'More work', 'Surgery', 'a'),
          rf('h3', 'Question 7. The patient has a fever.', 'F'),
        ],
      },
      gaps: [
        ['g1', 'If you exercise regularly, you will feel [BLANK].', 'better', ['good', 'better', 'best']],
        ['g2', 'She has [BLANK] finished her homework.', 'already', ['already', 'yet', 'still']],
        ['g3', 'I am looking forward [BLANK] the weekend.', 'to', ['to', 'for', 'at']],
        ['g4', 'He suggested [BLANK] more water.', 'drinking', ['drink', 'drinking', 'to drink']],
      ],
      schreiben: {
        teil: 'Paper 3: Writing',
        taskType: 'Opinion essay',
        task: 'Question 8. Write about 80 words: Should schools teach more about healthy eating? Give at least two reasons.',
        minWords: 80,
        criteria: ['Content', 'Communicative Achievement', 'Organisation', 'Language'],
        modelAnswer:
          'In my opinion, schools should teach more about healthy eating because many teenagers eat too much fast food. Schools could also offer healthier lunches.',
        feedback: ['Clear opinion', 'At least two reasons', 'Linking words'],
      },
      sprechen: {
        teil: 'Paper 4: Speaking',
        situation: 'Question 9. Discussion: fitness programmes at work.',
        roleA: 'Candidate',
        roleB: 'Examiner',
        starterLine: 'Do you think companies should pay for employee fitness programmes?',
        points: ['Advantage', 'Disadvantage', 'Example', 'Your opinion'],
        minExchanges: 4,
        modelAnswer: 'Me: Yes, because healthy staff work better.\nExaminer: Is it expensive?\nMe: Maybe, but sick days cost more.',
        feedback: ['Give reasons', 'Respond to the examiner'],
      },
    });
  }

  const EN = {};

  ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach((lv) => {
    if (lv === 'A1') {
      EN.A1 = buildA1();
      return;
    }
    if (lv === 'A2') {
      EN.A2 = buildA2();
      return;
    }
    if (lv === 'B1') {
      EN.B1 = buildB1();
      return;
    }
    if (lv === 'B2') {
      EN.B2 = buildB2();
      return;
    }
    if (lv === 'C1') {
      EN.C1 = buildC1();
      return;
    }
    if (lv === 'C2') {
      EN.C2 = buildC2();
      return;
    }
    if (EN[lv]) return;
    const legacy = buildLegacyFlat(lv, 'Health and Lifestyle');
    EN[lv] = buildEn(lv, legacy.topic, {
      lesen: legacy.lesen,
      horen: legacy.horen,
      gaps: legacy.gapfill.sentences.map((s, i) => [`g${i + 1}`, s.text, s.answer, s.options]),
      schreiben: { ...legacy.schreiben, minWords: { C2: 160 }[lv] || 80 },
      sprechen: { ...legacy.sprechen, minExchanges: { C2: 5 }[lv] || 4 },
    });
    EN[lv].level = lv;
    EN[lv].official.certificate = CAMBRIDGE[lv];
  });

  function get(subject, level) {
    if (subject === 'de') return typeof GoetheDemoExams !== 'undefined' ? GoetheDemoExams.get(level) : null;
    const exam = EN[level];
    return exam ? JSON.parse(JSON.stringify(exam)) : null;
  }

  function has(subject, level) {
    if (subject === 'de') return typeof GoetheDemoExams !== 'undefined' && GoetheDemoExams.has(level);
    return Boolean(EN[level]);
  }

  return { get, has };
})();
