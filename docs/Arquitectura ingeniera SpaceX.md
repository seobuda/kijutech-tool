video explicado por youtuber español, lo resume y explica a su manera:

Los mejores ingenieros del mundo están aprendiendo a coordinar agentes de IA en paralelo. El laboratorio de IA chino Dipsig dice que en su propia experiencia
0:099 segundosun humano puede gestionar entre tres y cinco agentes en paralelo. Esta mujer gestiona 50. Es ingeniera en SpaceX, la
0:1717 segundosempresa de Elon Musk. Ya sabemos cómo le gusta la optimización a este [música] señor. En esta entrevista explica en 57 minutos cómo lo hace, pero yo te lo voy
0:2525 segundosa resumir en 10 sacando los tres mecanismos más importantes.
0:3434 segundos[suspiro][grito ahogado]
0:3535 segundosEsta mujer trabaja en Grockbot, el sistema de agente de inteligencia artificial autónomos desarrollado por SpaceX y Encursor, que supongo que todos
0:4242 segundoslo conoceréis. Es interesante porque entiende las limitaciones humanas y habla de construir un sistema, un sistema que otorgue al humano confianza.
0:5555 segundosI have a team of engineers on then the mode of operation I'm going to be in is going to be like micromanagement.
1:061 minuto y 6 segundosag y esto es lo más importante, es el
1:171 minuto y 17 segundosobjetivo de estos tres mecanismos de los que os voy a hablar. Así que vamos a comprender cómo esta mujer consigue confiar completamente en sus agentes.
1:261 minuto y 26 segundosMecanismo número uno, feedback loop. El primer mecanismo es muy sencillo y extremadamente útil. Enseñar a los
1:331 minuto y 33 segundosagentes a comprobar su propio trabajo, que es muy fácil de decirlo, pero ¿cómo lo hago? Normalmente, cuando le pides a
1:401 minuto y 40 segundosun agente que te escriba código, pasa algo como esto. La gente empieza a hacer cosas por ahí y después de 5 minutos te dice, "Listo." Y entonces tú vas a
1:491 minuto y 49 segundosregistrarte en la aplicación y te da un error. Fíjate lo que está pasando aquí.
1:581 minuto y 58 segundosCuello de botella hablando en plata significa que tú eres el lento del sistema. lo que ralentiza el resto de engranajes, pues la solución consiste en
2:052 minutos y 5 segundosque ese paso de comprobación lo haga el propio agente en lugar de hacerlo tú.
2:102 minutos y 10 segundosI think the most important skill that in toolbox agication.
2:192 minutos y 19 segundosY esto se puede hacer de dos formas.
2:222 minutos y 22 segundosPrimero, mediante pruebas automáticas, ejecutando código que compruebe si las cosas funcionan. Por ejemplo, si le pides que cree un sistema de registro,
2:292 minutos y 29 segundosel propio agente puede ejecutar una prueba que intente registrar a un usuario y compruebe si se ha creado correctamente. Pero los agentes pueden crear código y ejecutarlo, eso ya lo
2:382 minutos y 38 segundossabemos. Así que vamos con la número dos, interactuando con la aplicación. En la entrevista, ella cuenta que desarrolló una herramienta llamada
2:452 minutos y 45 segundosControl Glass, que permite a sus agentes abrir cursor y utilizarlo como si fuera una persona normal. Es decir, el agente puede abrir la aplicación, pulsar
2:532 minutos y 53 segundosbotones, navegar los menús y comprobar si todo funciona. Pero eso no fue suficiente porque los agentes podían utilizar la aplicación, pero no sabían
3:013 minutos y 1 segundodónde estaba cada cosa. Así que creó lo que se llama un future map, una especie de mapa que explica a la gente dónde está cada funcionalidad y cómo acceder a
3:093 minutos y 9 segundosella. Y ahora, cuando alguien reporta un error, el agente puede buscar la funcionalidad, acceder a ella e intentar reproducir el problema por sí mismo sin
3:173 minutos y 17 segundosque un humano tenga que guiarlo constantemente. Y esto es una locura.
3:223 minutos y 22 segundosReconstruir un bug es uno de los principios fundamentales que permiten solucionarlo. Sencillamente porque si no sabes que provoca un fallo, es muy
3:303 minutos y 30 segundosdifícil encontrar su causa. Y ahora ese proceso se puede automatizar. A esto lo llamamos feedback loop, que básicamente
3:383 minutos y 38 segundosconsiste en que el agente realiza una acción, comprueba el resultado y si algo falla, utiliza esa información para corregirse y volver a intentarlo. Un
3:463 minutos y 46 segundosproceso que se repite hasta conseguir el resultado definido. Genial. Pues con esta técnica nos vamos a asegurar de una cosa, es escribir código correcto, que
3:553 minutos y 55 segundosno significa que sea un código bueno.
4:064 minutos y 6 segundosVale. Y entonces, ¿cómo escribo buen código además de código correcto?
4:114 minutos y 11 segundosEl buen código es importante porque es el que te permite escalar una aplicación, es el que te permite comprender, controlar y ampliar una
4:184 minutos y 18 segundosaplicación sin que se te salga de las manos. Así que, ¿cómo me aseguro de que el código que escribe la IA es bueno, además de correcto?
4:274 minutos y 27 segundosMecanismo dos, agent evals, convertir los errores de tus agentes en instrucciones que puedan utilizar. Ese
4:344 minutos y 34 segundoses el segundo mecanismo. ¿Y cómo hacemos esto? Porque seguro que los más experimentados ya tenéis la respuesta en
4:404 minutos y 40 segundosvuestra cabeza. Skills. Correcto. Y nada. Pues hay más. Porque claro, imagina que cada vez que una gente se
4:484 minutos y 48 segundosequivoca creas una nueva skill, después otra y otra y otra. Al final puedes terminar con decenas de instrucciones, algunas contradictorias, otras
4:574 minutos y 57 segundosdesactualizadas y pues sin tener muy claro qué es lo que está funcionando realmente. Y aquí es donde entra un concepto fundamental, las evalsuaciones
5:065 minutos y 6 segundosde agentes
5:095 minutos y 9 segundos[música]
5:135 minutos y 13 segundosporque no basta con decirle a un agente cómo tiene que trabajar, también hay que comprobar que realmente sigue esas instrucciones. [resoplido] Y para
5:205 minutos y 20 segundoshacerlo, esta ingeniera utiliza algo bastante curioso, es que pone a sus propios agentes a examinar a otros agentes y funciona de la siguiente
5:285 minutos y 28 segundosforma. Primero, un agente coordinador prepara una especie de examen definiendo qué debería hacer correctamente el agente que estamos evaluando. Lanza
5:365 minutos y 36 segundosvarios agentes en paralelo, cada uno intentando resolver una tarea utilizando esa skill. Y cuando terminan, otro
5:435 minutos y 43 segundosagente evalúa los resultados, comprueba cuáles han seguido las instrucciones y cuáles no, y les asigna una puntuación.
5:505 minutos y 50 segundosPero aquí viene lo interesante, porque si los resultados no son buenos, puede modificar la skill y volver a repetir el
5:575 minutos y 57 segundosexamen. Y otra vez, y otra vez, así conseguir que esa skill produzca resultados mucho más fiables. Así que
6:056 minutos y 5 segundosfijaos lo que está pasando aquí. Estamos construyendo otro bucle, otro flujo que se repite una y otra vez.
6:136 minutos y 13 segundos[música]
6:186 minutos y 18 segundosen la que intervienen varios agentes de forma totalmente autónoma, sin intervención humana, para resolver una tarea, mejorarse a sí mismos. Genial,
6:266 minutos y 26 segundospues ya no necesitas estar corrigiendo constantemente los mismos errores.
6:316 minutos y 31 segundos[resoplido] Pero hay un pequeño problema, bueno, uno bastante gordo en realidad, es que por muy buenas que sean tus skills, siguen siendo instrucciones
6:396 minutos y 39 segundosy los agentes pueden olvidarlas, interpretarlas mal o simplemente no seguirlas. Tu agente puede alucinar. Así
6:476 minutos y 47 segundosque esta ingeniera plantea algo muy interesante. Y si en lugar de pedirles que respeten determinadas reglas, construimos un sistema que directamente
6:556 minutos y 55 segundosles impida saltárselas. Y aquí entra el tercer mecanismo, los guard rails. Los guard rails, que podríamos traducir como
7:037 minutos y 3 segundosbarreras de seguridad son reglas que los agentes no pueden saltarse. Entonces, por un lado, tenemos las skills, ¿no?,
7:107 minutos y 10 segundosque le dicen a la gente cómo debería de hacer las cosas. Un guard rail, por otro lado, bloquea directamente que las haga de una determinada manera. Por ejemplo,
7:197 minutos y 19 segundosen un skill puedes decir que bajo ningún concepto se pueden guardar contraseñas sin cifrar y que la gente se la salte y simplificadamente escriba algo así y
7:277 minutos y 27 segundosentonces la has cagado a nivel de seguridad. Con un G Rail, la I escribe esto y cuando se va a publicar el cambio salta un pedazo de error gigante que
7:347 minutos y 34 segundosbloquea la subida directamente sin preguntar. Bueno, pues esta ingeniera ha llevado esta idea bastante más lejos.
7:427 minutos y 42 segundosPara que os hagáis una idea, ha literalmente baneado el uso de Use Effect en React.
7:537 minutos y 53 segundostambién ha baneado completamente los comentarios de código porque decía que los agentes convertían
8:028 minutos y 2 segundossus aclaraciones en explicaciones innecesarias dentro del código y no solo eso, sino que además decidió reescribir la primera versión de la aplicación
8:108 minutos y 10 segundoscompletamente para reestructurarla de una forma no tan habitual.
8:238 minutos y 23 segundosY es que en lugar de usar una estructura pensada para humanos, lo hizo pensada para agentes de IA. Pues bueno, no nos puede revelar tanta información, pero lo que sí nos cuenta es que cada
8:318 minutos y 31 segundosfuncionalidad de la aplicación tiene su propio repositorio, donde se encuentra prácticamente todo el código relacionado con ella. Así, cuando un agente tiene
8:398 minutos y 39 segundosque modificar, por ejemplo, el sistema de registro, sabe exactamente dónde tiene que trabajar sin tener que ponerse a buscar entre cientos de archivos. Y
8:478 minutos y 47 segundosademás ha establecido reglas automáticas que impiden mezclar partes del código que deberían de estar separadas. Pero lo más interesante es por qué ha decidido
8:558 minutos y 55 segundoshacerlo de esta forma. Y es que se dio cuenta de que los agentes tienen una tendencia bastante curiosa. Siempre intentan encontrar el camino más corto para resolver un problema.
9:129 minutos y 12 segundosPero claro, muchas veces ese camino es precisamente el que acaba provocando problemas más adelante.
9:229 minutos y 22 segundosY eso es exactamente lo que intenta conseguir con esta arquitectura, que el camino más corto sea también el correcto. Digamos que mete unos railes
9:309 minutos y 30 segundosmuy marcados a los agentes y según dice escribir código en Grockbot es un por todos esos railes. Pero
9:449 minutos y 44 segundosy gracias a todo esto ha llegado un punto en el que prácticamente no necesitas revisar el código que escriben. Nuevo pasado de una persona
9:519 minutos y 51 segundosque tenía que supervisar constantemente a unos pocos agentes, a una ingeniera que puede dejar a decenas de ellos trabajando sin estar pendiente de cada
9:599 minutos y 59 segundospaso. ¿Y qué resultados está consiguiendo con todo esto? Pues resultados locos y absurdos.
10:1110 minutos y 11 segundosAnd this month we're only on the 128
10:1710 minutos y 17 segundoslanded. I woke up today and PR landeview on landed. Sí, sí. Esta mujer integra
10:2610 minutos y 26 segundoscambios en su aplicación mientras duerme. No tiene sangre en las penas.
10:3110 minutos y 31 segundosEntonces, hemos llegado a un punto en el que tenemos agentes que comprueban su propio trabajo sin depender constantemente de un humano, agentes que
10:3810 minutos y 38 segundosevalúan y mejoran sus propias instrucciones aprendiendo de los errores que cometen y un sistema de reglas que impide que se salten determinados
10:4610 minutos y 46 segundoslímites, incluso cuando trabajan de forma autónoma. Así que fijaos en cómo la forma en que ha estructurado todo su trabajo le permite que trabajar con 50
10:5510 minutos y 55 segundosagentes no signifique controlar 50 agentes, sino construir un sistema en el que no necesites controlarlos constantemente.
11:0511 minutos y 5 segundosUh, you're the head chef.


Video de la entrevista original:

Descripcion de video en youtube: 
Most developers are using AI agents like this:

Prompt → Agent → Answer

Lauren Tan's approach is radically different.

She's demonstrating a model closer to:

Engineer → Chief of Staff → PM → Specialist Agents → Execution → Verification

In other words:

Don't build an AI assistant. Build an AI team.

The interesting part isn't simply having 20+ agents.

It's the architecture.

🤖 Specialized agents
🔄 Loops
🕸️ Graphs
👩‍💼 Coordination
📋 Task delegation
✅ Verification
🚀 Autonomous execution

A Chief of Staff agent can coordinate other agents.

A PM agent can break down goals.

Specialist agents can execute individual tasks.

Other agents can review and verify the output.

That changes the role of the engineer.

Instead of asking:

"How do I prompt AI to write this code?"

The question becomes:

"How do I design a system of agents that can reliably build this?"

That's a very different skill.

Public write-ups around Lauren Tan's workflow describe her using multiple GrokBot agents and a coordinator-based architecture, while noting that the exact agent counts repeated online aren't consistently verified. The architecture itself — coordination, specialization, loops and verification — is the more interesting takeaway.

This could be one of the biggest shifts in software engineering:

AI assistant → AI teammate → AI engineering team

What would you delegate to an autonomous AI engineering team first?

Transcripcion:

Capítulo 1: The role of AI in coding
0:000 segundosUm, personally I think that uh the best use of you of AI is really as like a like a pair like someone you're pair
0:099 segundosprogramming with and not someone as not not a not a tool to just replace the act of writing code or worse outsourcing your thinking.
0:1919 segundosAnd I think there's a tendency like, you know, because AI is so exciting, you want to put AI everywhere and be seen as someone who's very, you know, um, what
0:2828 segundosdo you call it? Like, uh, on the ball, I guess, with with AI. Uh, that you feel this pressure of like, you know, I'm
0:3535 segundosjust going to I got to increase my productivity. I got to ship like 100 PRs this week and barely understand what I'm doing and, you know, vive code my way to a million ARR or whatever.
0:4848 segundosUm but I think you know um one of the things that I've personally seen is that although when I use AI I save some time
0:5757 segundosyou know writing the code I actually find myself spending more time reviewing what the AI did and like correcting it.
1:041 minuto y 4 segundosSo, you know, like I've I've tried the the thing that a lot of people say like, you know, you uh instead of prompting an AI to just build the feature outright,
1:131 minuto y 13 segundosyou sort of get it to uh build a spec for you first, then you review that spec, and then you do this whole thing.
1:191 minuto y 19 segundosThen it's like, uh, okay. So, I assume you can see my screen. Yes. Yeah, we're good.
Capítulo 2: Building trust in AI agents
1:241 minuto y 24 segundosSo yeah, today yeah I think I think the big theme for me as I've been using agents to write code and I'm sure a lot of you have had the same experience as
1:331 minuto y 33 segundoswell is how do you trust it? You know especially if you are an engineer that's been writing code for a very long time.
1:401 minuto y 40 segundosYou have a lot of opinions and lessons that you've learned about doing good engineering. And when you see agents
1:471 minuto y 47 segundosjust, you know, winging it and, you know, guessing, hallucinating, uh, you know, confidently stating that they found the smoking gun, uh, for the
1:561 minuto y 56 segundoshundth time, uh, but it's actually not the real problem. You lose a lot of trust. And when you lose when you don't have much trust in your agents, I feel
2:062 minutos y 6 segundoslike you you really can't get the most out of them. And for me, the parallel is like with management. Uh so if I'm an a
2:132 minutos y 13 segundosmanager an engineering manager of a team and I have a bunch of you know I have a team of engineers uh on my team and I
2:212 minutos y 21 segundosdon't trust them then the mode of operation I'm going to be in is going to be like micromanagement right I'll have to spend a lot of time looking over my
2:302 minutos y 30 segundosreports shoulders and checking that they're doing their work well you know that they're not shipping bugs to production
2:382 minutos y 38 segundosand so I drew this chart because uh it's not it's not a very scientific chart but like this is how I imagine myself and my
2:472 minutos y 47 segundosjourney through using agents. So you know like fast forward or back forward
2:532 minutos y 53 segundosuh or fast back uh fast backwards like a year or so when you know nobody was or not many people were using agents to
3:013 minutos y 1 segundocode. Uh I think you uh you know get into this mode where you are
3:093 minutos y 9 segundosin very heavily in the loop with one or several like a handful of agents and you find yourself just constantly fig uh you
3:173 minutos y 17 segundosknow trying to understand what your agents are doing uh and you're very very in loop. You're watching every single output. you are sitting there prompting
3:263 minutos y 26 segundosum and you really can't parallelize beyond that because you don't again you don't have that trust right you can't go
3:333 minutos y 33 segundosto a 100 agents uh like spawn 100 agents when you don't even trust the output of one agent
3:403 minutos y 40 segundosso over the past 5 months I feel like I've really been able to uh like ascend this trust curve and now I'm at the
3:493 minutos y 49 segundospoint where uh I actually have this sounds kind of scary to say is and it makes me sound like a slop artist, but I I promise I'm not. But I actually have my agents now um automerging PRs for me.
4:014 minutos y 1 segundoUh which is like a wild thing to say, but um like I woke up today and there were like 20 PRs landed and I just
4:084 minutos y 8 segundosreviewed them on Maine like they were already landed and they were good. Uh so how did I get to that point is basically what I wanted to talk about today.
4:204 minutos y 20 segundosUh and again like yeah, feel free to jump in if you have questions. Colin.
4:234 minutos y 23 segundosUm, but uh Oh, yeah. Of course, I got to show this this chart. Uh, where uh
4:334 minutos y 33 segundosNo, do do not trust to someone requested to control my computer. Uh, I probably won't do that. Uh, but yeah. Yeah. So
4:414 minutos y 41 segundosthis chart I think I I I'm sharing this chart not to kind of like flex but to kind of show like the journey like so
Capítulo 3: Verification as a core skill
4:494 minutos y 49 segundosyou can see like the curve like it sort of like inversely matches the contributions I've been able to land at cursor. So I joined five months ago and
4:584 minutos y 58 segundosfive months ago like I you know my first month I was like not very productive because I was ob you know I was learning the codebase didn't know what the heck
5:055 minutos y 5 segundoswas going on and as I got more confident in in my agents uh I've really been able to kind of ramp up my productivity uh
5:145 minutos y 14 segundosand again like yeah like last month I shipped 1,000 PRs which is ridiculous.
5:205 minutos y 20 segundosUh, and then this month we're only on the 12th. I'm already at like almost 800 PRs landed. Uh, so the velocity is
5:295 minutos y 29 segundosdefinitely high and you you I'm sure a lot of you will definitely be questioning like how how much of this code is actually good. Um, and I think
5:375 minutos y 37 segundosyeah, like that's definitely fair to question.
5:415 minutos y 41 segundosUm, but uh, yeah, I think I think if you set up your agents well, you can definitely get to a very similar level.
5:515 minutos y 51 segundosUm, and so I'm going to talk about how we do that.
5:565 minutos y 56 segundosUh so for me I think I'm curious like I guess call in your experience as well but uh for me I think the most important
6:056 minutos y 5 segundosskill that you should have in your toolbox when you work with agents is verification.
6:126 minutos y 12 segundosUh and by verification I mean the ability for an agent to actually run the code uh or take CPU traces or heap
6:216 minutos y 21 segundossnapshots or uh you know open an iOS simulator whatever you know however your application is exposed to your users it
6:316 minutos y 31 segundoscan do the same thing and uh run it for real and actually test and verify it don't work because that's the thing that
6:396 minutos y 39 segundosreally closes the loop. uh it doesn't guarantee your agent writes good code uh but it allows them to at least write
6:476 minutos y 47 segundoscorrect code uh which is a big a really big step forward for being able to trust your agent. Um
6:556 minutos y 55 segundosI will I can share one example that we have uh within cursor. Uh
Capítulo 4: Implementing control skills
7:037 minutos y 3 segundosoops where let me open this
7:147 minutos y 14 segundosmake this uh make me full screen. There you go. Uh so for the for cursor's agent
7:227 minutos y 22 segundoswindow uh so this is actually an interesting story but uh when I joined cursor 5 months ago uh they're actually
7:317 minutos y 31 segundosuh well I was supposed to join a different team I was supposed to join like the cloud agents team uh but then since I have a lot of experience working
7:387 minutos y 38 segundoson react and agents window is a react application uh I was uh I was asked to basically help out
7:477 minutos y 47 segundoswith uh the agent window work. Uh but um there wasn't really a lot of like skills
7:557 minutos y 55 segundosto help me. So I just found myself that okay uh agents switch is going to launch in like a week right we have a really
8:018 minutos y 1 segundotight deadline and um there was uh you know I was just sitting there like okay I'm going to open up the performant the
8:088 minutos y 8 segundosthe chrome dev tools and just like take a trace look at it myself and try to make sense of this flame graph and keep in mind I was just like in my first week
8:178 minutos y 17 segundosso I had no idea what I was looking at no idea what you know I mean I had some idea but you know the codebase was completely fresh to me uh and I realized
8:268 minutos y 26 segundoslike My Asian had no idea either, you know, like I would take a screenshot of the tree, I would download trace. I would send it to it and it' be like, "Yeah, it kind of looks like this, you
8:348 minutos y 34 segundosknow, uh, and it would like confidently state like it's this thing." And then I try to fix that and turns out that's not the actual thing.
8:428 minutos y 42 segundosSo, this was a very very slow process.
8:448 minutos y 44 segundosAnd if you've ever done any like performance work yourself or, you know, just even development with an agent where you don't have a verification skill, you are the verifier, right?
8:548 minutos y 54 segundosYou've you're the bottleneck. you you you tell your agent to do something and then it goes off and write some code.
8:598 minutos y 59 segundosThen you open up your you know local dev build and then you start to say oh you know it doesn't work. Then you got to copy paste screen uh you know screenshots or console errors or
9:089 minutos y 8 segundoswhatever. Uh and then your agent like slowly kind of like uh you know works with that and then tries to understand
9:159 minutos y 15 segundosit and um fix the thing but then you're constantly just in the loop and and being a bottleneck. So there's really no
9:229 minutos y 22 segundosway to parallelize. So the control glass skills are like one of the first skills I built uh for cursor. Uh and glass by
9:309 minutos y 30 segundosthe way is the code name for agents window that we use internally but it's just cursor I guess. Um and so this
9:389 minutos y 38 segundosskill uh is I guess the the the code itself is not super interesting. Your agent can very easily make one for you.
9:459 minutos y 45 segundosuh where if if you're building an electron app or a web app or even iOS uh applications uh you can teach your agent
9:549 minutos y 54 segundoshow to use like the chrome dev tools protocol or through uh Apple has some utilities as well for running the
10:0210 minutos y 2 segundossimulator and taking traces and controlling programmatic control as well. Uh so that's really useful. Uh but
10:1010 minutos y 10 segundosone thing I want to talk about is uh the this thing
10:1710 minutos y 17 segundosuh where is the read me? Uh so this skill comes with this very unique feature called or not feature uh unique
Capítulo 5: Leveraging feature maps
10:2510 minutos y 25 segundosfile called a feature map. And so the story then is like I built this skill and so now the agent was able to uh
10:3410 minutos y 34 segundosactually run the agent window and take traces and whatnot. Uh but it had no idea what what the agents window was. So
10:4410 minutos y 44 segundosum you know like someone would say like oh the the left sidebar is like laggy or something like that or you know the
10:5110 minutos y 51 segundosright side the the PR tab is not working and the agent would just be like kind of flailing around. It would spend a lot of time trying to like look up the code and
10:5810 minutos y 58 segundosyou know where is this feature? How do I actually get to it on the UI which made it basically completely useless? Uh, you know, like we would I would run this
11:0811 minutos y 8 segundosskill locally and you know, it would spawn a dev build. Uh, but then it' just be churning like I just try to click
11:1511 minutos y 15 segundoshere. It it wouldn't know how to get to things. Um, and it was just an awful experience. Uh, so was putting arrows on
11:2311 minutos y 23 segundosmy screen. Um, so uh yeah, this this feature map has been really useful uh because it teaches the agent how to get to all of the features that you have.
11:3411 minutos y 34 segundosUm, and in PAC, the plugin that I I've made, uh, if you search for PAC cursor
11:4211 minutos y 42 segundoson Google, you you'll find it. Uh, but there is a create verification skill in that plugin where it actually helps you set up something like this for yourself.
11:5111 minutos y 51 segundosUm, including the feature map. So, it will actually explore the code and build up this initial feature map that tells your agent how to get to all of the
11:5911 minutos y 59 segundosdifferent features that you have. Uh and this is extremely powerful because now like you have these user reports that
12:0612 minutos y 6 segundoscome in uh you you can actually map even like a vague report or even a screenshot. So we have this uh
12:1312 minutos y 13 segundosinternally at cursor where uh we have a slack channel with you know lots of people giving us feedback on the agents
12:2012 minutos y 20 segundoswindow and rockbot and whatnot. Uh and often times the report is very bad like very low quality like someone just put
12:2912 minutos y 29 segundosvery often we get like a screenshot like and then someone just says question mark question mark question mark like what is this [laughter] and you know like the without this your
12:3712 minutos y 37 segundosagent's like I have no clue right but with a feature map like this it has a lot more context and understanding of
12:4512 minutos y 45 segundoshow to actually navigate how to get to all the different features. Uh so like you know example like I guess like the sidebar like what is the sidebar uh you
12:5412 minutos y 54 segundosknow like all the different sub features that are present in it um like from the user point of view here's where how do I get to it all the different keyboard
13:0313 minutos y 3 segundosshortcuts uh even like the the what do you call it the DOM elements or yeah like the
13:1013 minutos y 10 segundosattributes that you use for selecting things through the CDP uh are all there.
13:1613 minutos y 16 segundosSo uh again yeah this is like really really powerful uh for for agents uh and pack ships uh that create
13:2513 minutos y 25 segundosverification skill but also a maintain verification skill uh so you can keep this up to date.
13:3113 minutos y 31 segundosCool. Yeah, I was just going to ask how you created that. So do you mind sharing a little bit more about um that that process in the context of Pstack and maybe just what Pstack is for the folks who aren't familiar?
Capítulo 6: Developing Pstack and skills
13:4113 minutos y 41 segundosYeah. So, P stack is pretty interesting because uh well, first of all, the name is kind of goofy. Like the P the P in P
13:4813 minutos y 48 segundosstack is like potato potato stack because I um so uh uh there's a pretty
13:5713 minutos y 57 segundosuh famous person Gary Tan who is the CEO of Y Combinator and he's come up with this plug-in called GStack uh Gary Stack
14:0614 minutos y 6 segundosand uh funnily enough we share the last name. We have no relations. Uh, but I thought it would be funny to kind of, you know, poke fun at Gary and make Pstack my version of of of his plug-in.
14:1914 minutos y 19 segundosUh, but kind of tailor it to my own set of P engineering practices.
14:2514 minutos y 25 segundosUh, but I honestly actually never set out to build PAC. Uh, it just started with a bunch of skills, right? like I started with that control glass skill
14:3314 minutos y 33 segundosand then I started with another skill like called how which I also noticed through like observing agents. Um so
14:4114 minutos y 41 segundoslike you know in the early days of me you know trying to climb this ladder I was like super in the loop and I was basically nitpicking my agents to an
14:4914 minutos y 49 segundosextreme degree. I was like I would tell it um you know this feature has stopped working. Here's a bug report like why isn't it working?
14:5914 minutos y 59 segundosAnd very often the agent would just like confidently state like, "Oh, it has to be this, right? It has to be this thing." And I noticed like when I looked
15:0715 minutos y 7 segundosat the actual tool calls, I noticed it wasn't actually reading the code that I thought should be affected. And that
15:1515 minutos y 15 segundosmade me just extremely suspicious. And at that point, I was like, I'm not going to I can't trust any this agent anymore cuz it's just it's just completely
15:2215 minutos y 22 segundoshallucinating. And I think I think it's very easy to just, you know, like build up that distrust and
15:2915 minutos y 29 segundosnot and kind of feel helpless like, you know, you don't know how to help your agents succeed. But like again, I think
15:3615 minutos y 36 segundosthe the the management analogy is super helpful because like imagine if you were a manager of an engineering team and you had an engineer on your team who was a
15:4515 minutos y 45 segundosreally good coder, no business context whatsoever. you know they they just you just hired them and they they onboarded you know like 5 seconds ago. Uh and so
15:5515 minutos y 55 segundoshow do you actually teach that person to be effective? So how you do that is through a skill. uh a skill being just you know it's just markdown right by you
16:0316 minutos y 3 segundosknow it encodes a lot of information instructions a lot of uh you can really draw out a lot of intelligence from an
16:1216 minutos y 12 segundosagent by well some people on Twitter call it like you know pull the agent to a different latent space which is kind of like a fancy way of just saying like
16:2016 minutos y 20 segundossince uh you know LLMs are sort of like they predict the next token uh when you give it some high quality tokens uh to
16:2816 minutos y 28 segundosbegin with then you know it it can kind of pattern match on like a higher space that's you know smarter.
16:3616 minutos y 36 segundosUm so that's like a very interesting model there. But yeah I built PAC very very incrementally. Uh so uh started
16:4416 minutos y 44 segundoswith just really observing how agents you know all the fail different failure modes of of that agents were having. And every time I saw that, I just, okay, I'm just going to make that a skill, right?
16:5416 minutos y 54 segundosLike stop hallucinating, actually go and search up, look up the code, use a lot of sub agents, uh, and yeah, stop guessing.
17:0617 minutos y 6 segundosYeah, that makes sense. One, one kind of followup question here, uh, both from myself and from a bunch of people in the chat. So, I guess it's two two parts.
17:1317 minutos y 13 segundosSo, one is like how do you maintain these skills? So, like the product changes over time. Obviously, there's a lot of people who are shipping against the codebase. So how do these skills get
17:2017 minutos y 20 segundosmaintained? Uh and then second to that is like how do you know when your verification is is good enough? Uh like and you know you can trust that the ver
17:2817 minutos y 28 segundosverification loops that you've built are going to I guess you trust that the outputs uh when they're done.
17:3517 minutos y 35 segundosUh yeah maybe I'll talk about um I think there are some related maybe I'll start with this one first. So like how do I maintain these skills?
17:4717 minutos y 47 segundosSo, um, if you're not familiar with this concept, an eval is essentially like a way to, uh, well, I the mental model I
17:5517 minutos y 55 segundoshave is like it's like a unit test for an agent. Um, and, uh, you can actually make your own eval. You don't need like
18:0218 minutos y 2 segundosa special framework for them. You can build you can you can build one depending on like, you know, how scientific and how rigorous you want to be. Uh, my screen is red.
Capítulo 7: Maintaining skills with evals
18:1318 minutos y 13 segundosYeah, there's a little button. Um, sorry. Do you mind like disabling the drawing or something? I I can't see my screen.
18:2018 minutos y 20 segundosYeah, sorry. If you guys could not draw on the screen, that'd be great. But, um, there's a little button in the Got a troll. Yeah, the little drop down.
18:2918 minutos y 29 segundosHow do I clear? Yeah, you got it. Perfect.
18:3318 minutos y 33 segundosUm, yeah. So, eval test your skills basically. And actually
18:4218 minutos y 42 segundosin Pstack we ship uh under potato mode there's a playbook if you search for it called eval playbook. Um and it's uh
18:5118 minutos y 51 segundosuh it's like not it's actually pretty pretty rigorous the way it's done. Uh but um essentially what I do is I spawn
18:5818 minutos y 58 segundosa lot of different sub agents. I have like my main coordinator agent uh come up with a rubric for uh what I want the
19:0719 minutos y 7 segundosskill to do. Um, and then it spawns all these sub agents and it it creates individual directories for them uh which
19:1619 minutos y 16 segundosare cleverly named to not let the sub agent know that it's being evaluated because uh agents can actually tell and when they do they change their behavior.
19:2619 minutos y 26 segundosUh but it does a bunch of stuff like that to um essentially yeah like test whether or not the skill I'm making or
19:3519 minutos y 35 segundoschanging is actually doing what I think it does. Um and one of the really nice things about cursor is that we are we we
19:4219 minutos y 42 segundossupport so many different models. So you can actually eval your skill across all sorts of different models. Um and you
19:4919 minutos y 49 segundosknow get a sense of how well it performs across that different matrix. Um especially for the models that you use.
19:5819 minutos y 58 segundosUh so I do this a lot. every time I I modify a skill, I will run one of these uh like the Eval playbook uh and make
20:0520 minutos y 5 segundossure that you know it's actually leading to a result I want. Uh but I will say like maintaining skills is actually pretty
20:1420 minutos y 14 segundoshard. Uh it requires I think a lot of taste and observation. So you kind of need to be very good at being a backseat
20:2220 minutos y 22 segundosdriver. You know what I mean? Like if you do pair if you ever done pair programming for example uh and you watch a coworker code and you just like you
20:3020 minutos y 30 segundosyou could probably do this better you know you could do you know like why did you not do this right you you ask a lot of questions to your coworker and it's kind of a similar thing here you like
20:3820 minutos y 38 segundosyou don't want to just be a passive observer of the agent you want to be very in the driver she seat in the initial stages when you're building up your own set of skills uh you know
20:4720 minutos y 47 segundosobviously you can use something like PAC but if you're building your own set of skills it's very I think you you know, opening up the all the tool calls and
20:5520 minutos y 55 segundoslike reading the code and reading all the to uh the agent behavior and their thinking blocks is a really great way to
21:0321 minutos y 3 segundossee where they they fail, right? like what what you know where are they being done and then you can go and build a scale for that and then with
21:1221 minutos y 12 segundosverification how you trust it is it's I think it's also a very similar iteration loop uh where you know like I actually
21:1921 minutos y 19 segundosdid the same process for verifying the verification skill where I actually get um so one thing that's interesting about
21:2721 minutos y 27 segundoseval is that you can sort of hill climb them meaning that uh your eval can produce a score right uh a score that
21:3521 minutos y 35 segundosyou can get your coordinator to produce uh but also comp uh you can have a judge agent of a different model to uh kind of
21:4421 minutos y 44 segundoscross reference and make sure that the first model is not being biased, right?
21:4921 minutos y 49 segundosThe model that's judging all of the sub agents that are running the thing. Uh but you can also like hill climb. So meaning that you can you can use like
Capítulo 8: Scaling with cloud agents
21:5621 minutos y 56 segundos/loop in cursor and you can say okay keep looping on this eval right until everything is 10 out of 10 as an
22:0422 minutos y 4 segundosexample. Uh and I did the same the basically the same approach with the control skill. And so I kind of it was very it was very hands-off actually. Uh
22:1222 minutos y 12 segundosso you know I uh I kind of built I built that skill that way like the CLI and that skill. Um and over time it's gotten
22:2122 minutos y 21 segundosreally good. Uh but yeah, it was definitely not super smooth at the beginning. It required a lot of iteration and I think there's an analogy
22:3022 minutos y 30 segundoshere for me which is um well I make this analogy later in a different slide on my drawing here. Uh but I think of it like
22:4022 minutos y 40 segundosuh you know as a as a engineer now you're sort of more like you uh like maybe a manager or the analogy I like is
22:4822 minutos y 48 segundoslike you're like a a chef in a restaurant. uh you know, you're the head chef. Uh you're not cooking all the food yourself anymore. You have a team of
22:5622 minutos y 56 segundoscooks, right? You have line cooks, you have a sue chef, you have, you know, all these different stations. Um and it's your job to really design the
23:0423 minutos y 4 segundosenvironment. You know, you you're in charge of setting up the kitchen. You're in charge of, you know, like giving tasks to different people. So,
23:1423 minutos y 14 segundosum yeah, it's a very interesting way of working. Uh but yeah, that's that's how I've basically built uh these verification skills.
23:2323 minutos y 23 segundosYeah, just just one thought there on like to go try to go one layer deeper.
23:2723 minutos y 27 segundosSo are you let's say we wanted to build um an eval or a skill for for something and we wanted to kind of get better on
23:3523 minutos y 35 segundosits own which is is what I think you're suggesting. Uh are you doing that in like a work tree kind of isolated with like the sub agents and and then the
23:4323 minutos y 43 segundosreviewer agent and and all that? Is it happening like in some type of cloud hosted environment? Like what's the the more the practical steps if I wanted to
23:5023 minutos y 50 segundosgo do this uh and like set up a verification system for something? What would I what would I do or where would I start?
23:5723 minutos y 57 segundosUm I think that uh the best place to start is local because you can observe you can definitely observe what your
24:0524 minutos y 5 segundosagents are doing. So, uh, if you're building a verification skill for yourself, uh, I would definitely start local and just have your agent bring up
24:1324 minutos y 13 segundosthe application, whether it's like a CLI or a desktop app or whatever. And so, you can actually observe, right? You can
24:2024 minutos y 20 segundossee how the agent is interacting with the the application. You can see it, you know, how it calls like the different
24:2824 minutos y 28 segundosAPIs that that allow it to interact with the uh the application.
24:3424 minutos y 34 segundosUm but uh for me personally uh I have basically been kind of all in mostly all in on cloud agents because they're
24:4124 minutos y 41 segundosextremely powerful. Uh and the really powerful thing about cursor is the the cloud agents actually where if you spend
24:4924 minutos y 49 segundosa little bit of time setting up your environment these control skills these verification skills pay a huge amount of dividends
24:5624 minutos y 56 segundosbecause it's not just something that makes you as a single engineer better.
25:0225 minutos y 2 segundosIt actually levels up your whole team uh and even your whole company because uh you can actually start thinking about cloud agents. You can start thinking
25:0925 minutos y 9 segundosabout automations that automatically do things like uh I I get I kind of talk about this a bit later but I'll just
Capítulo 9: Refactoring and architecture
25:1725 minutos y 17 segundoskind of get into it. Uh where where you know for example like I talk a lot about this agent we have called Benny, right?
25:2525 minutos y 25 segundoswho who uh you know takes all of the bug reports that we get and it automatically goes off in the cloud, opens up a cloud
25:3325 minutos y 33 segundosuh it's you know its desktop. It runs cursor in its own computer and it uses the same control skills to interact with
25:4225 minutos y 42 segundosthe application and try to reproduce the bug uh or the user report, right? And this is so so powerful because at once I
25:4925 minutos y 49 segundoscan immediately I I get so much information from this automatically like here in this example you can see that uh the benny actually reproduced the bug uh
25:5825 minutos y 58 segundosbut it's already fixed on main. So it actually confirms that we fixed this problem already and all I need to do is just release another build of of cursor.
26:0826 minutos y 8 segundosUh, so that's like huge information there that I didn't have to go off and sit with an agent, you know, and spend an hour trying to figure like is this
26:1526 minutos y 15 segundosfixed, is this not fixed. So you you you gain back so much time. Uh, but you know, everybody on my team benefits from this. Everybody at the company benefits
26:2326 minutos y 23 segundosfrom this. Uh, so definitely think that uh, you know, keeping these using cloud
26:3026 minutos y 30 segundosagents is super powerful. Uh, but yeah, it's like a journey. You have to trust it first, right? before you you get to this point. And that's it goes back to
26:3926 minutos y 39 segundoswhat I was saying here where, you know, it's very hard. It's almost impossible.
26:4326 minutos y 43 segundosAnd I would definitely encourage you not to try to jump from, you know, like if you're still in this zone, you don't want to jump to like I'm going to spawn
26:5226 minutos y 52 segundoshundred of thousand or thousands of cloud agents right now because you're just going to waste a lot of tokens. Um, and it's going to be extremely expensive.
27:0027 minutosYeah. So just to kind of recap so far, basically the if we wanted to go on the journey that you've kind of gone on, it would be to start with verification,
27:0927 minutos y 9 segundosbuilding some some skills and some some ways of determining that the agents are producing at least like correct code.
27:1527 minutos y 15 segundosWhether like you said whether it's good code or not is maybe a separate question, but like it's it's technically solving the problem by looking at you know stack traces, looking at you know
27:2227 minutos y 22 segundosthe the actual behavior in the app and so on. Um, and then once we trust it locally, then we can start to think about scaling into the cloud and running
27:2927 minutos y 29 segundosmore agents that are picking up signals, I guess, on their own, right? So whether that's like a bug report that comes in or something, they can go and pick it up and solve the problem and and give us
27:3827 minutos y 38 segundosback a PR. And then maybe the last step is like automerging the PRs, which uh is where you're at, maybe not where everyone is at.
27:4527 minutos y 45 segundosUm, and then and reviewing the one main, but um, is that is that about right?
27:4927 minutos y 49 segundosYeah, exactly. I think yeah, that's why I drew this this uh this this curve, right? because that this this basically describes my journey of you know when I
27:5727 minutos y 57 segundosstarted barely could use a couple agents and I was just observing every single thing. I think there's really no shortcut for going from here to there
28:0628 minutos y 6 segundosbecause this is really about your personal level of trust in agents, right? Um obviously, you know, as a as engineer, you don't want to just slop
28:1328 minutos y 13 segundoscode into production. So, how do you actually build up that trust? Takes um a lot of uh I guess taste and judgment. Um
28:2228 minutos y 22 segundosbut, uh you know, like I think plugins like Pstack definitely kind of help you uh get up to speed much quicker. Uh and
28:3028 minutos y 30 segundosso I guess it's like if you trust me and you trust PAC then in by extension you can maybe trust your agents but if you
28:3828 minutos y 38 segundosdon't trust me and I I definitely would not encourage people to blindly trust me uh uh you know if you build up your own
28:4628 minutos y 46 segundosset of skills that you can obviously you know take a look at PAC and kind of fork it make it your own improve the skills definitely encourage that uh but for me
28:5528 minutos y 55 segundosit's really all about it just keeps coming back to trust you know every one of of us here in this chat have a different standard for engineering. Uh
29:0329 minutos y 3 segundosand there are different things that are important for us in our codebase and uh when you are able to encode all of that
29:1129 minutos y 11 segundosinto skills and you can verify that your agent is actually doing them that allows you to really kind of ascend this curve
29:1729 minutos y 17 segundosand um uh you know start automating things. Uh there's another piece I wanted to talk about. Um if there's more
29:2629 minutos y 26 segundosYeah, go for it. I'll pick up more questions as I go. Yeah, I think there's a third part to this which I haven't talked about yet which is kind of an interesting one which is like
29:3429 minutos y 34 segundosrefactoring and rewriting. Like one of the uh I guess most controversial one of the most controversial topics in the
29:4229 minutos y 42 segundosindustry I think is like should you rewrite your app or not? Um because I think engineers are very prone to this
29:5029 minutos y 50 segundoswhere especially when you join a company you come in and you see like the codebase and you're like oh man this is like who wrote this code you know
29:5729 minutos y 57 segundosit's terrible I want to rewrite the whole thing is a very common inclination and I think a lot of you know before
30:0430 minutos y 4 segundosagents um and I guess arguably even now people will definitely discourage you from re rewriting stuff but I'm actually
30:1130 minutos y 11 segundoshere to make a case for why you might want to consider it.
30:1530 minutos y 15 segundosUm because I think it really depends. Uh you know uh brownfield applications I think are
30:2330 minutos y 23 segundosactually in a pretty good spot especially if they're set up well already. Uh and like recently I've been talking to some people but uh you know I
30:3130 minutos y 31 segundosI was just observing I I just noticed this parallel which is that a lot of big tech company problems are now
30:4030 minutos y 40 segundoseverybody's problems. Um, and the big tech company problem, you know, like when I was working at Meta, like we had this giant monor repo, we had like, I
30:4830 minutos y 48 segundosdon't know, tens of thousands of engineers just, you know, like banging on their keyboards and and shipping code and a lot of really great engineers at Meta.
30:5830 minutos y 58 segundosUh, but, uh, I'll say like, you know, you'll be surprised that the code quality is actually not that good.
31:0431 minutos y 4 segundos[laughter] Um, and so I often joke that like, you know, before AI slop, we had human sloth. Um and so uh you know I
31:1131 minutos y 11 segundosthink a lot of big tech infra like uh like what Meta has or Google you know you know really big tech companies are
31:1931 minutos y 19 segundosactually designed for that where you you're sort of like you're catering to the the you know like uh this sounds so bad to say but like the the least
31:2631 minutos y 26 segundoscapable engineer on your team right you build you build frameworks you build conventions you build guard rails you know you restrict credentials so that
31:3531 minutos y 35 segundosyou know your intern doesn't wipe your production database Um there's uh you know if you have that
31:4331 minutos y 43 segundoslevel of infra already I think your agents can actually already do a very solid job right because they have the
31:4931 minutos y 49 segundosthe guard rails are already in place for agents to not cause havoc or not cause too much havoc uh in your codebase um
31:5831 minutos y 58 segundosand you can always add more you know guardrails. Uh but I think like green field applications especially are you know like the brand new applications are
32:0632 minutos y 6 segundoslike the biggest risk in my opinion. Uh and also the greatest opportunity because you know if you vibe code a
32:1332 minutos y 13 segundosproject uh a prototype um like we did for Grockbot you know Grockbot was spun up very very very quickly. Um and if you
32:2132 minutos y 21 segundosif you haven't heard of of Grockbot it's like a a new application we just launched yesterday. Uh it's it's really cool. uh lets you orchestrate your
32:3032 minutos y 30 segundoscreate like individual agents that have their own identity and you can kind of orchestrate them. It's super cool.
32:3532 minutos y 35 segundosDefinitely check it out. Um but yeah, that was it's like a very it was a very green field application like most prototypes are so like vibe coded very
32:4332 minutos y 43 segundosquickly. Humans were not reading the code at all. And uh I had this tweet recently uh where I said something about
32:5332 minutos y 53 segundosorganic architecture. Um maybe I'll find it. Uh but the idea is
33:0033 minutosthat uh when you have a completely vibecoded application, you essentially have no guardrails whatsoever. So uh
33:0733 minutos y 7 segundosyour agents when you give them a task, they will just solve it in whatever method is the most convenient. And over time you get
33:1633 minutos y 16 segundosinto this uh situation where you have a code base that is spiraling out of control because you don't understand it.
33:2433 minutos y 24 segundosuh your agents understand it I guess in a way but like they've built something that is you know optimized for short for
33:3133 minutos y 31 segundosshortcuts uh and uh you know it will you will suffer you'll have a lot of of issues with that application
33:4033 minutos y 40 segundosuh so I think starting your codebase with uh like very strong constraints is
33:4733 minutos y 47 segundosvery much needed uh because like when you have a codebase that you can trust right when you have guardrails that
33:5333 minutos y 53 segundosactually help you uh uh help your agents write good code. you can get into the, you know, like into this part of the
34:0134 minutos y 1 segundocurve where I I where like I I said, you know, I woke up today and I had like 20 PRs merged u by my agents. And that's
34:0934 minutos y 9 segundosbecause I invested a lot a lot of time uh over 600 PRs. I I I calculated yesterday uh when I refactored all of
34:1834 minutos y 18 segundosGrockbot to this new architecture that I've been building. Um, and yeah, I've gotten to a point where I
34:2634 minutos y 26 segundosI don't really look I really don't look at the code anymore. And um, I say that not just, you know, to sell you tokens,
34:3334 minutos y 33 segundosbut because I, you know, it it it took a lot of work to get to that point. I spent a lot of tokens to get the codebase to this point where I no longer
34:4134 minutos y 41 segundoshave to look at it. Uh, but I'm very excited because, you know, of the potential where, you know, it's not just this doesn't just benefit me. It
34:4934 minutos y 49 segundosbenefits everyone contributing to Grothbot and it also empowers you know designers and product managers and you
34:5734 minutos y 57 segundosknow pe uh even GTM people to add features to Grothbot and I don't have to worry you know I don't have to to wake up at night in in the middle of the
35:0535 minutos y 5 segundosnight and worry like oh someone's just merged the perf regression right I have a ton of constraints and CI like it's actually very annoying to write
35:1435 minutos y 14 segundoscode in in graph web but like agents absorb all of that annoyance Um but yeah, I'm happy to talk about
Capítulo 10: Dune architecture principles
35:2135 minutos y 21 segundoswhat exactly that is. Um yeah, I think one question um yeah, before we get into the this part here is
35:2835 minutos y 28 segundosjust around that element of like what your your your CI looks like or maybe some of the constraints and then also like the average PR size. I saw a question about that earlier just to give
35:3735 minutos y 37 segundospeople you know kind of a a glance. It doesn't have to be like mathematically average but just uh you know like what generally the size of the a PR is. um if
35:4635 minutos y 46 segundosit's only a couple lines of code or you know um yeah uh um I think it depends uh let me
35:5535 minutos y 55 segundosI'm trying to do this in a way where I'm not going to like you yeah you don't have to share the actual number like an actual average I think this is fine benchmark
36:0236 minutos y 2 segundosbut like we have so okay this is not that interesting but uh well fun fact is
36:0936 minutos y 9 segundosthat virtualization in grogbot and in uh cursor is actually powered by uh pretext
36:1636 minutos y 16 segundosuh which is a sort of new library that someone's built. Um that's really interesting. You should you should check it out. But that's not really that
36:2536 minutos y 25 segundosimportant. Uh I think the average PR size I actually don't know. I I don't know if I want to click on these. Uh I probably can, but [clears throat] I
36:3336 minutos y 33 segundoswould say like they can range anywhere from a few hundred lines or 50 lines to like a thousand depending on what the
36:4036 minutos y 40 segundosthing is doing. Uh, so like here I'm actually like deleting a bunch of files.
36:4536 minutos y 45 segundosSo I expect that it's just like mostly deletion. Uh, but yeah, it kind of varies.
36:5136 minutos y 51 segundosThere's no like Yeah, there's no like hard cap or hard limit. Are there all like 50 line PR?
36:5536 minutos y 55 segundosThere's no hard cap. Yeah, there's definitely no hard cap. But I I do encourage my agents to split up their work into multiple PRs. Uh I do that
37:0237 minutos y 2 segundosmostly because uh I like I like the idea of the I guess maybe this is much harder to do now as in the world of agents and
37:1137 minutos y 11 segundosyou have like so many commits but I like the idea that you know the git history is a very rich source of context. Uh,
37:1737 minutos y 17 segundosand I like the I like each PR to sort of atomically describe what that small piece of thing is doing, which also
37:2637 minutos y 26 segundosmakes it easier for me to revert changes and like figure out, you know, oh, I shipped a bug and it's just it's here, right? It's not in this 40,000 line PR
37:3437 minutos y 34 segundoswhere you who knows what landed in there.
37:3837 minutos y 38 segundosUh, but I don't have a hard cap on PR size.
37:4237 minutos y 42 segundosCool. And then um yeah, also quick question on like CI. So again, you don't have to go into like uh the screen share of like your CI does, but just generally
37:5037 minutos y 50 segundoswould you describe what the CI kind of looks like uh or how strict it is?
37:5537 minutos y 55 segundosUh yeah, so uh well specifically for Grockbot. So Dune is the is the sort of cheeky code
38:0338 minutos y 3 segundoscode name for the architecture that we've built for Grockbot. Um the CI looks pretty annoying because there's
38:1138 minutos y 11 segundoschecks for everything. So like literally I have um uh well if you've written any react for example you know you know that
38:1938 minutos y 19 segundosone of the biggest foot guns in react is use effect. Uh so in uh Dune and in graphbot we've banned use
38:2738 minutos y 27 segundoseffect. So Dune is just you can the the mental model of what Dune is uh you can kind of think of it as like Nex.js JS
38:3438 minutos y 34 segundosfor uh electron apps and it's designed for agents to write uh and it's like custom for you know our agent powered
38:4238 minutos y 42 segundosapplications. Um so the CI checks are very like specific to that like you know don't use use effect it's it's banned
38:4938 minutos y 49 segundoslike CI will fail uh and yell at you. We have like some of the more interesting ones that people might raise eyebrows is
38:5638 minutos y 56 segundoslike I actually ban code comments as well uh which is very interesting. Uh, but I've noticed that 99% of the time
39:0539 minutos y 5 segundosagents just write code comments that kind of describe some historical thing that is actually totally irrelevant to the code. Um, like it will often say
39:1439 minutos y 14 segundoslike, you know, oh, Lauren said you should never do this and it's now in in a code comment. I'm like, what? Like why what that was? I didn't say that as like
39:2239 minutos y 22 segundosa durable, you know, global rule. I just meant like your this PR sucks and you should change that part.
39:2939 minutos y 29 segundosBut agents don't really understand us that well surprisingly uh and or they kind of assume too much and they kind of
Capítulo 11: Strict enforcement and CI
39:3639 minutos y 36 segundosdo things in like very stupid ways. So like yeah we just ban everything everything you can imagine like the
39:4239 minutos y 42 segundosagents are bad at we ban. Uh so one example that we actually suffer a lot in the agents window is we have uh you know
39:5239 minutos y 52 segundosyou if you've used the agents window you've definitely seen performance issues and you know we're constantly trying to fix them. Uh but it's like a
39:5939 minutos y 59 segundosit's a never- ending struggle because there's so many pull requests that get merged. Every any one of them could just regress performance or stability or
40:0740 minutos y 7 segundosreliability. Uh you know the agents window doesn't have this architecture yet. I plan to do bring this learning back there and kind of refactor
40:1540 minutos y 15 segundoseverything there. Uh but uh it just regresses super often. uh because uh there's just one example is like we have
40:2440 minutos y 24 segundosvery poor um isolation between processes. So like on you know on on electron you have a renderer thread that renders your UI but you also have like a
40:3340 minutos y 33 segundosmain thread that you can run other code that you know doesn't need to block the renderer.
40:3940 minutos y 39 segundosUm, but we do a poor job of separating those things. And so oftentimes you just accidentally have code that gets pulled into running on the renderer thread and
40:4840 minutos y 48 segundosthen all of a sudden you're competing with the the renderer that you know that has a very if you want like 60 fps you have to every frame that gets drawn has
40:5740 minutos y 57 segundosto be done in 16 milliseconds. So very very small you know deadline per frame uh if you want you know a very smooth
41:0441 minutos y 4 segundosproduct. Uh and when you start building bringing in accidentally bringing in you know things that are like very computationally heavy or they have a lot
41:1241 minutos y 12 segundosof IO uh then you just get into like a lot of jank right your your FPS really drops you start uh you know losing
41:2041 minutos y 20 segundosframes you get long tasks that take more than 16 milliseconds and you just get this really choppy experience.
41:2741 minutos y 27 segundosSo all of those patterns that we've learned basically building electron apps we've encoded into this framework and it becomes like a hard failure. So I
41:3541 minutos y 35 segundosliterally in in grabbot we literally have a directory called electron main electron renderer and we have uh import
41:4441 minutos y 44 segundosuh CI guess where we actually check the dependency graph to make sure you're not accidentally importing code from one
41:5141 minutos y 51 segundosdirectory to another. Uh so that's enforced by CI um as well as bug bots uh
41:5841 minutos y 58 segundoswhich is our which cursors um like code review tool that runs on CI uh you know in our agents MD it's everywhere like so
42:0642 minutos y 6 segundosI I I um I have this thing here where I I talk about like um you know like there
Capítulo 12: Sustainable agent workflows
42:1342 minutos y 13 segundosare multiple layers I think for building a good codebase. Uh obviously the codebase is one where uh if you have an
42:2142 minutos y 21 segundosarchitecture like this where it's extremely strict uh you know the the the way to build features is very conventional that's like the strongest
42:2942 minutos y 29 segundosstrongest level of enforcement because agents just love to copy existing patterns. So uh one example of this in
42:3742 minutos y 37 segundosrockbot is like we have this these concepts called like a feature and we have entry points and transcript cards like oh you know the cards that you see
42:4442 minutos y 44 segundosin the chat these are all like like nouns I guess in in the framework and so there's a very conventional way of
42:5242 minutos y 52 segundoscreating them and so like a feature is all in in a single directory as an example and so all of the code that
42:5942 minutos y 59 segundoscontributes to that feature lives in one directory so it's all coll-located in one place makes It's super easy. You know, agents don't have to like uh grap
43:0743 minutos y 7 segundosaround and try to figure out like where all the things are. It just looks at the feature and like, oh, okay, I'm working on the onboarding feature in Grockbot.
43:1643 minutos y 16 segundosUh I'm just going to work in this directory. And for 80% of the work, it's mostly just very encapsulated there.
43:2243 minutos y 22 segundos[clears throat] But uh like it's like very it's like designed again for you know like the dumbest agent like you
43:2943 minutos y 29 segundosdon't have to think, right? the the the one of the key principles I have for this framework is like the shortest the shortest path is the best path.
43:3943 minutos y 39 segundosSo uh because that plays exactly to how agents love to write codes like they like to take shortcuts really you know they they'll find the quickest way to
43:4843 minutos y 48 segundossolve the problem. So why not make that the best way to solve the problem? Uh so I I probably won't get into all the
43:5643 minutos y 56 segundosspecific details. Um and uh the this framework is really more of a collection of ideas and principles rather than
44:0344 minutos y 3 segundossomething that will open source. Uh you can you can you know screenshot this I guess if you want and uh tell your agent to uh do some build build something like this for you too.
44:1544 minutos y 15 segundosUm yeah, but it's really all about the layers uh you know like the the codebase is one part with features uh and
44:2244 minutos y 22 segundosdirectories and you know import or blocking import dependencies uh that shouldn't be imported uh but and and it all enforces that and static analysis.
44:3244 minutos y 32 segundosSo like uh there's CI checks. We have a lot of lints for bad patterns that we observe. Uh compiler diagnostics. Uh
44:4144 minutos y 41 segundosthere's also rules and bugbot which are um I think like three, four, five are more soft, right? These two actually
44:4944 minutos y 49 segundosmake make CI red, right? So that you know there's a hard constraint where the agent can't just write crappy code
44:5844 minutos y 58 segundosfor rules and skills and bogbot. Your agents can still forget, right? You can still or it may not always consistently
45:0745 minutos y 7 segundosapply them. So I like to layer them, but I don't I don't like to rely on them as the only source of enforcement because
45:1645 minutos y 16 segundosit's very very soft, right? And if you if you only have rules and bug ball and skills and a style guide for your code, you will it's only a matter of time
45:2445 minutos y 24 segundosbefore your code base looks like complete trash. I'm sorry to say that, but uh I definitely recommend yeah like you know investing in you know things
45:3345 minutos y 33 segundosthat can be hard and forced right and this is why you know maybe the choice of text stack that you use is also very
45:4045 minutos y 40 segundosimportant. Um like I think for example Rust is sort of making you know it's like getting super popular again uh
45:4845 minutos y 48 segundosbecause the compiler is so strict right the compiler enforces so many different things you know there's a borrow checker that you have to appease and if as long
45:5645 minutos y 56 segundosas you make sure your agents don't write unsafe code blocks uh you can more or less feel somewhat confident that if the code compiles it probably works and it's
46:0546 minutos y 5 segundosgood. Uh but you see it gives you that level of trust and confidence that you as a human engineer no longer need to go
46:1446 minutos y 14 segundosand check it yourself. You know you you rely on code and static analysis to actually make that uh a lot smoother.
46:2546 minutos y 25 segundosUm, and I I guess the worst part, the worst place to be in is if you are stuck in code review land where you actually
46:3246 minutos y 32 segundosenforce all of the constraints, the invariance in your codebase by literally the human person saying, you know, reading the code and like, okay, you should not do this, right?
46:4346 minutos y 43 segundosEvery time you have to do that, you should consider that as a code smell like a anti- pattern and you should say, "Okay, instead of me commenting on the
46:5046 minutos y 50 segundosPR, how do I turn this into a hard rule?" Right? How do I turn this into a lint rule? How do I turn this into a CI
46:5846 minutos y 58 segundosfailure? Or how do I even categorically eliminate this problem uh entirely? Uh I
47:0547 minutos y 5 segundosI can talk about another migration I've done, but I'll probably pause here. Sure.
47:0947 minutos y 9 segundosYeah. I feel like that's that's where I am to be honest. is is what you're describing right now, which is that like I don't have all of these rules. So, I have some things to go do after this
47:1747 minutos y 17 segundossession in terms of being able to scale my agents. I'm I'm definitely on like the uh you know, maybe a couple of parallel ones locally stage. So, like
47:2547 minutos y 25 segundostwo to three locally and I'm sure most people here are on the same. So, uh yeah, I know we only have a couple minutes left. Lauren, was there anything else that you wanted to to highlight?
47:3447 minutos y 34 segundosObviously, there's lots of questions, so I can grab more, but I want to give you a few minutes if there's anything else you want to talk about. Well, I think I've been yapping for quite a lot, so I'm maybe let's just do questions.
47:4347 minutos y 43 segundosOkay, cool. Uh, one question that had uh a couple of uh came up a couple times was just around like token usage.
47:4947 minutos y 49 segundosSo, the the question is like is is what you're describing a realistic thing for people who are on, you know, uh a normal
47:5747 minutos y 57 segundosset of token usage. They don't have, you know, basically unlimited tokens uh to work with.
48:0348 minutos y 3 segundosI think that's a really good point. I mean like obviously you know I work at a AI lab where we have unlimited tokens.
48:0948 minutos y 9 segundosSo uh I definitely cannot say that you know this is something everyone should do in the exact same way
48:1748 minutos y 17 segundosthat I did it. I think it's possible to get to this point without you know breaking the bank.
48:2248 minutos y 22 segundosBut you know if you're like an engineering leader or you know you're you you have a startup that you lead um I think to me it's a question of ROI.
48:3148 minutos y 31 segundosUm, and it's like, uh, yes, you spend a lot of money on tokens in the upfront stage. You know, like refactoring a code base is going to take a lot of tokens.
48:4148 minutos y 41 segundosUh, adding all these things uh is going to take a bunch of tokens. But if we're heading to a world where agents are
48:4848 minutos y 48 segundoswriting all the code and you know, you want to be very lean, right? You don't want to have to hire you don't want to be you don't want to become like meta,
48:5648 minutos y 56 segundosright? Like I mean like in terms of you don't want to become a 10,000 person engineering org because I mean that's a cool problem to have but also you have
49:0549 minutos y 5 segundosso much overhead. There's like planning you know like you it's it's a personally I I wouldn't uh it it's not super fun
49:1449 minutos y 14 segundosbut um I think you want to stay very nimble right and you want to you want to be like agents are all about allowing you to do things that you couldn't do
49:2249 minutos y 22 segundosbefore. That's really to me like the value of agents, you know, it's not just storing tokens on every single little thing. But um to me like the thing I
49:3149 minutos y 31 segundoscouldn't do before is like enforce this level of constraints in a codebase by myself, right? Like I'm just a single
49:3949 minutos y 39 segundosperson, you know? Uh it would have taken me years to build this framework uh and do all the refactoring and test
49:4849 minutos y 48 segundoseverything myself and verify, you know, like run. Imagine if there it was just me, right? you know in in pre- agent era just like running you know by it would
49:5649 minutos y 56 segundostake me so long right and my salary is pretty high right like so you know the the question I think an engineering
50:0450 minutos y 4 segundosleader might have is just then you know like what is there's a trade-off of do you hire someone to do this or do you
50:1150 minutos y 11 segundosspend the tokens to set up a codebase so that even the the most naive right the dumbest agents can do a good job and
50:2050 minutos y 20 segundoswhen you actually get to this point like even agents that are not you know fable size do an excellent job of writing code
50:2750 minutos y 27 segundosand this pays a lot of dividends as well for me personally where I've empowered not just myself but again like PMS
50:3650 minutos y 36 segundosdesigners engineers who are not familiar with Grockbot to just contribute in a way that is sustainable
50:4450 minutos y 44 segundosso I think yeah it's definitely like a trade-off for sure you know like nothing is like free for sure uh and tokens are pretty expensive Uh but oh actually uh I
50:5350 minutos y 53 segundosI I don't know how many of you have seen this but we actually announced Grock 4.6 today. So very exciting. Finally out. Um
51:0151 minutos y 1 segundoso yeah, Grath 4.6 would be like a great it was very very smart. Uh it's really good on the on the benchmarks. Uh and
51:0851 minutos y 8 segundosit's the same the tokens uh well uh I hopefully I'm not saying this incorrectly, but uh I believe the cost
51:1551 minutos y 15 segundosper token is the same as 4.5. So you're actually getting more intelligence for the same cost. Uh I think this is an
51:2351 minutos y 23 segundosarea that cursor tries to cursor and SpaceX AI try to really optimize for like that heretto frontier of you know
51:3251 minutos y 32 segundoscost versus intelligence. Uh you know we don't necessarily want to build the biggest model ever because that is extremely expensive to run. It's really
51:4051 minutos y 40 segundosabout like how do you find that sweet spot right? you don't you don't need a giant model, but it's just super smart, right? And it's not very expensive for inference.
51:4951 minutos y 49 segundosUh but um yeah, I think to kind of round it up, um I think it's like a it's it's there's a if you do your own analysis, I
51:5851 minutos y 58 segundosfeel like it's pretty positive. It it'll be pretty positive that the ROI you get from investing in stuff like this uh
52:0552 minutos y 5 segundosjust empowers not just yourself, but your whole team to be so much more productive, right? right? Like imagine if you have an army of engineers like me
52:1352 minutos y 13 segundoswho are shipping so much improvements and and bug fixes uh you know every day, right? Like that is pretty exciting.
52:2352 minutos y 23 segundosCool. Uh one last question before we wrap up. This one is for the people in product on the on the call.
52:2852 minutos y 28 segundosSo let's say we do have an army of engineers who are shipping like Lauren.
52:3252 minutos y 32 segundosI'm just curious like how is the product team or other functions of your company keeping up given that like if you're shipping so quickly how are they using
52:4152 minutos y 41 segundosAI more to do their jobs? Like as much as you can speak to that obviously you don't have like you're not in that role but just curious about how that works.
52:4852 minutos y 48 segundosUm I think this is where Grothbot has been actually exceedingly powerful. uh where so before graphbot like you know
52:5652 minutos y 56 segundosuh obviously cursor only had cursor like we only had agents window we had a CLI we had an IDE and these are really like
53:0453 minutos y 4 segundospower user tools right like devel they're designed for developers so it's very very developerentric you can do knowledge work in them but it like the
53:1253 minutos y 12 segundosUI is not really optimized for that so we actually didn't really have uh well I think like a lot of people like you know
53:2053 minutos y 20 segundosGTM product like they might have use cursor uh to do their work but it definitely wasn't like a delightful
53:2653 minutos y 26 segundosexperience for them. Um I think now with Grobot uh it's become Grogbot is basically like
53:3453 minutos y 34 segundostheir kusher moment for people who are not in tech in my opinion like it's like it's like a very very accessible way to
53:4153 minutos y 41 segundosuse agents in a very comfortable very familiar interface. It looks like iMessage um and it's very fun too. You know you can give your agent a fun name.
53:5153 minutos y 51 segundosuh you can have you can kind of do orchestration with in a very like natural way where you can sort of you know each agent is like a person right and now you got a team of agents like
54:0054 minutosworking on you have one one agent per account that you manage as an example or if you're a PM you have you know you can have an agent that summarizes all the
54:0754 minutos y 7 segundoswork that Lauren did last night and then now you know what I did right so I think our PMs are leveraging that a lot and
54:1454 minutos y 14 segundosthey're shipping code too uh so you know like often times they will just say oh here's a bug I fixed it can you look at it and then I'll go review it and
54:2254 minutos y 22 segundosactually it's just perfect. I'm like okay stamp. Uh so uh that I think that shows that you know the the Dune architecture is holding up right the all
54:3154 minutos y 31 segundosthe the really strict constraints allow people who are not experts in engineering to contribute at a high level. Uh so I'm I feel like I'm already
54:3954 minutos y 39 segundosseeing that pay off a lot where uh you know designers and PMs are just able to to to ship features directly. Um, and
54:4854 minutos y 48 segundosthat just makes the Grockbot team super fast, right? Where we can ship so quickly. Um, and we have a lot planned.