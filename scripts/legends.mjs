// Genera las listas "imprescindibles" de cada estilo (Rock legendario, Pop español…):
// los grupos famosos de verdad, elegidos a mano, con sus canciones más escuchadas
// según el catálogo público de Deezer. Solo texto: títulos, artistas y portadas.
//
//   node scripts/legends.mjs
//
// Escribe src/lib/legends.json (índice para la portada) y public/legends/<id>.json (canciones).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PER_ARTIST = 3

// estilo → { because: "Porque te gusta …", lists: [[id, nombre, descripción, artistas]] }
const GENRES = {
  Rock: { because: 'el rock', lists: [
    ['rock-legendario', 'Rock legendario', 'Los grupos que hicieron historia',
      ['Queen', 'AC/DC', 'Led Zeppelin', 'The Rolling Stones', 'Pink Floyd', 'The Beatles', "Guns N' Roses", 'Nirvana', 'Dire Straits', 'U2',
        'Bon Jovi', 'Aerosmith', 'The Police', 'Bruce Springsteen', 'Deep Purple', 'The Who', 'Creedence Clearwater Revival', 'Red Hot Chili Peppers',
        'Foo Fighters', 'Scorpions', 'The Doors', 'Eagles', 'David Bowie', 'Jimi Hendrix']],
    ['rock-en-espanol', 'Rock en español', 'Los himnos del rock en nuestro idioma',
      ['Héroes del Silencio', 'Extremoduro', 'Fito y Fitipaldis', 'Los Rodríguez', 'Soda Stereo', 'Maná', 'Platero y Tú', 'Marea', 'Barricada', 'Leño',
        'Loquillo', 'Los Suaves', 'M Clan', 'Bunbury', 'Rosendo', 'Hombres G', 'La Fuga', 'Radio Futura', 'Burning', 'Triana', 'Andrés Calamaro', 'Caifanes']],
  ] },
  Pop: { because: 'el pop', lists: [
    ['pop-legendario', 'Pop legendario', 'Las estrellas del pop de todos los tiempos',
      ['Michael Jackson', 'Madonna', 'ABBA', 'Elton John', 'Whitney Houston', 'George Michael', 'Prince', 'Britney Spears', 'Beyoncé', 'Rihanna',
        'Lady Gaga', 'Taylor Swift', 'Coldplay', 'Adele', 'Bruno Mars', 'Ed Sheeran', 'Katy Perry', 'Justin Timberlake', 'The Weeknd', 'Dua Lipa',
        'Backstreet Boys', 'Spice Girls', 'Phil Collins', 'Cyndi Lauper']],
    ['pop-espanol', 'Pop español de siempre', 'Las canciones que todo el mundo sabe cantar',
      ['Mecano', 'Alejandro Sanz', 'La Oreja de Van Gogh', 'El Canto del Loco', 'Amaral', 'Estopa', 'Pablo Alborán', 'Joaquín Sabina', 'Miguel Bosé',
        'David Bisbal', 'Melendi', 'Aitana', 'Dani Martín', 'Manuel Carrasco', 'Malú', 'Leiva', 'Pereza', 'Duncan Dhu', 'Nacha Pop', 'Alaska y Dinarama',
        'Los Secretos', 'Rosalía', 'Enrique Iglesias', 'Álvaro Soler']],
  ] },
  'Hip-Hop/Rap': { because: 'el hip-hop y el rap', lists: [
    ['hiphop-clasicos', 'Clásicos del hip-hop', 'Los nombres más grandes del rap',
      ['Eminem', '2Pac', 'The Notorious B.I.G.', 'Dr. Dre', 'Snoop Dogg', '50 Cent', 'JAY-Z', 'Kanye West', 'Kendrick Lamar', 'Drake', 'Nas', 'OutKast',
        'Wu-Tang Clan', 'Travis Scott', 'Lil Wayne', 'Cypress Hill', 'Ice Cube', 'N.W.A.', 'Missy Elliott', 'A Tribe Called Quest', 'Post Malone', 'J. Cole',
        'Run-DMC', 'Beastie Boys']],
    ['rap-en-espanol', 'Rap en español', 'Lo mejor del rap y el urbano en castellano',
      ['Kase.O', 'Violadores del Verso', 'SFDK', 'Nach', 'Mala Rodríguez', 'Natos y Waor', 'Ayax y Prok', 'Rels B', 'C. Tangana', 'Duki', 'Canserbero',
        'Residente', 'Calle 13', 'Toteking#312396', 'Los Chikos del Maíz', 'El Chojin', 'Foyone', 'Trueno', 'Nicki Nicole', 'Bizarrap', 'Hard GZ', 'Quevedo']],
  ] },
  Electronic: { because: 'la electrónica', lists: [
    ['electronica-imprescindible', 'Electrónica imprescindible', 'De los pioneros a los grandes festivales',
      ['Daft Punk', 'Avicii', 'David Guetta', 'Calvin Harris', 'The Chemical Brothers', 'The Prodigy', 'Kraftwerk', 'deadmau5', 'Tiësto', 'Martin Garrix',
        'Swedish House Mafia', 'Moby', 'Fatboy Slim', 'Justice', 'Skrillex', 'Depeche Mode', 'Robin Schulz', 'Kygo', 'Armin van Buuren', 'Faithless',
        'Underworld', 'Jean-Michel Jarre', 'Disclosure', 'Major Lazer', 'Massive Attack']],
  ] },
  House: { because: 'el house', lists: [
    ['house-de-siempre', 'House de siempre', 'Los clásicos de la pista de baile',
      ['Bob Sinclar', 'Eric Prydz', 'Swedish House Mafia', 'David Guetta', 'Armand Van Helden', 'Roger Sanchez', 'FISHER', 'Duke Dumont', 'Disclosure',
        'Modjo', 'Stardust', 'Crystal Waters', 'Robin S', 'CeCe Peniston', 'Black Coffee', 'Purple Disco Machine', 'Claptone', 'Basement Jaxx', 'Inner City',
        'Martin Solveig', 'Calvin Harris', 'Frankie Knuckles', 'Fedde Le Grand', 'Benny Benassi']],
  ] },
  Techno: { because: 'el techno', lists: [
    ['techno-esencial', 'Techno esencial', 'Los nombres que llenan las cabinas',
      ['Charlotte de Witte', 'Amelie Lens', 'Carl Cox', 'Richie Hawtin', 'Jeff Mills', 'Adam Beyer', 'Boris Brejcha', 'Paul Kalkbrenner', 'Laurent Garnier',
        'Sven Väth', 'Nina Kraviz', 'Underworld', 'Stephan Bodzin', 'Tale Of Us', 'Ben Klock', 'Dubfire', 'Chris Liebing', 'Maceo Plex', 'Enrico Sangiuliano',
        'Reinier Zonneveld', 'Joris Voorn', 'Deborah De Luca', 'Solomun', 'Anyma']],
  ] },
  Latin: { because: 'la música latina', lists: [
    ['regueton-imprescindible', 'Reguetón imprescindible', 'Los que pusieron a bailar a medio mundo',
      ['Daddy Yankee', 'Bad Bunny', 'J Balvin', 'Don Omar', 'Ozuna', 'KAROL G', 'Maluma', 'Wisin & Yandel', 'Nicky Jam', 'Anuel AA', 'Rauw Alejandro',
        'Feid', 'Myke Towers', 'Tego Calderón', 'Ivy Queen', 'Zion & Lennox', 'Farruko', 'Sech', 'Arcángel', 'Plan B', 'Luis Fonsi', 'Becky G']],
    ['leyendas-latinas', 'Leyendas latinas', 'Salsa, bachata y pop latino de siempre',
      ['Shakira', 'Marc Anthony', 'Juan Luis Guerra 4.40', 'Celia Cruz', 'Romeo Santos', 'Ricky Martin', 'Juanes', 'Carlos Vives', 'Rubén Blades',
        'Héctor Lavoe', 'Gloria Estefan', 'Aventura', 'Luis Miguel', 'Chayanne', 'Selena', 'Juan Gabriel', 'Buena Vista Social Club', 'Gilberto Santa Rosa',
        'Prince Royce', 'Thalia', 'Paulina Rubio', 'Vicente Fernández']],
  ] },
  Metal: { because: 'el metal', lists: [
    ['metal-legendario', 'Metal legendario', 'Los gigantes del metal',
      ['Metallica', 'Iron Maiden', 'Black Sabbath', 'Slayer', 'Megadeth', 'Judas Priest', 'Pantera', 'Slipknot', 'System Of A Down', 'Rammstein', 'Motörhead',
        'Ozzy Osbourne', 'Korn#1327', 'Linkin Park', 'Avenged Sevenfold', 'Tool', 'Sepultura', 'Dio', 'Helloween', 'Manowar', 'Disturbed', 'Ghost#8506054', 'Sabaton',
        'Mägo de Oz']],
  ] },
  Punk: { because: 'el punk', lists: [
    ['punk-imprescindible', 'Punk imprescindible', 'Tres acordes y mucha actitud',
      ['Ramones', 'Sex Pistols', 'The Clash', 'Green Day', 'The Offspring', 'blink-182', 'Bad Religion', 'NOFX', 'Rancid', 'Dead Kennedys', 'Misfits',
        'Sum 41', 'Rise Against', 'Pennywise', 'Social Distortion', 'Buzzcocks', 'The Stooges', 'Iggy Pop', 'La Polla Records', 'Eskorbuto', 'Kortatu',
        'Ska-P', 'Siniestro Total', 'The Damned']],
  ] },
  Alternative: { because: 'la música alternativa e indie', lists: [
    ['indie-imprescindible', 'Alternativa e indie imprescindible', 'Los grupos que definieron el sonido alternativo',
      ['Radiohead', 'Arctic Monkeys', 'The Strokes', 'The Cure', 'The Smiths', 'Oasis', 'Blur', 'Pixies', 'R.E.M.', 'The Killers', 'Muse', 'Tame Impala',
        'Joy Division', 'Franz Ferdinand', 'The White Stripes', 'Florence + The Machine', 'Arcade Fire', 'Gorillaz', 'Placebo', 'The Smashing Pumpkins',
        'Pearl Jam', 'Kings of Leon', 'Imagine Dragons', 'The Black Keys']],
    ['indie-espanol', 'Indie español', 'Lo mejor de la escena independiente española',
      ['Vetusta Morla', 'Los Planetas', 'IZAL', 'Love of Lesbian', 'Lori Meyers', 'Viva Suecia', 'Arde Bogotá', 'Carolina Durante', 'La Casa Azul', 'Sidonie',
        'Dorian#17321', 'Second', 'Supersubmarina', 'Miss Caffeina', 'Varry Brava', 'Shinova', 'Sidecars', 'La M.O.D.A.#5260290', 'Zahara', 'Rigoberta Bandini', 'Ginebras',
        'Triángulo de Amor Bizarro']],
  ] },
  Jazz: { because: 'el jazz', lists: [
    ['jazz-legendario', 'Jazz legendario', 'Las grandes figuras del jazz',
      ['Miles Davis', 'John Coltrane', 'Louis Armstrong', 'Ella Fitzgerald', 'Duke Ellington', 'Billie Holiday', 'Charlie Parker', 'Thelonious Monk',
        'The Dave Brubeck Quartet', 'Chet Baker', 'Nina Simone', 'Herbie Hancock', 'Bill Evans', 'Stan Getz', 'Charles Mingus', 'Frank Sinatra', 'Nat King Cole',
        'Sarah Vaughan', 'Dizzy Gillespie', 'Oscar Peterson', 'Sonny Rollins', 'Wes Montgomery', 'Diana Krall', 'Norah Jones']],
  ] },
  Classical: { because: 'la música clásica', lists: [
    ['clasica-imprescindible', 'Clásica imprescindible', 'Las obras que todo el mundo reconoce',
      ['Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frédéric Chopin', 'Antonio Vivaldi', 'Pyotr Ilyich Tchaikovsky',
        'Claude Debussy', 'Franz Schubert', 'Johannes Brahms', 'Erik Satie', 'Giuseppe Verdi', 'Giacomo Puccini', 'Franz Liszt', 'Sergei Rachmaninoff#191347',
        'Antonín Dvořák', 'Richard Wagner', 'Maurice Ravel', 'Edvard Grieg', 'Camille Saint-Saëns', 'Ludovico Einaudi', 'Luciano Pavarotti', 'Andrea Bocelli',
        'Yo-Yo Ma', 'Georg Friedrich Händel#289768']],
  ] },
  Reggae: { because: 'el reggae', lists: [
    ['reggae-legendario', 'Reggae legendario', 'De Kingston al mundo',
      ['Bob Marley & The Wailers', 'Peter Tosh', 'Jimmy Cliff', 'Toots & The Maytals', 'UB40', 'Burning Spear', 'Steel Pulse', 'Gregory Isaacs', 'Dennis Brown',
        'Black Uhuru', 'Damian Marley', 'Ziggy Marley', 'Sean Paul', 'Shaggy', 'Inner Circle', 'Alpha Blondy', 'Israel Vibration', 'Desmond Dekker', 'Sizzla',
        'Buju Banton', 'Chronixx', 'Protoje', 'SOJA', 'Morodo']],
  ] },
  Folk: { because: 'el folk', lists: [
    ['folk-y-cantautores', 'Folk y cantautores', 'Voces y guitarras que cuentan historias',
      ['Bob Dylan', 'Simon & Garfunkel', 'Joni Mitchell', 'Leonard Cohen', 'Johnny Cash', 'Neil Young', 'Cat Stevens#282417', 'Nick Drake', 'Joan Baez',
        'Mumford & Sons', 'Bon Iver', 'The Lumineers', 'Fleet Foxes', 'Dolly Parton', 'John Denver', 'James Taylor', 'Tracy Chapman', 'Van Morrison',
        'Joan Manuel Serrat', 'Silvio Rodríguez', 'Víctor Jara', 'Mercedes Sosa', 'Passenger', 'Iron & Wine']],
  ] },
  Ambient: { because: 'el ambient', lists: [
    ['ambient-esencial', 'Ambient esencial', 'Música para parar el tiempo',
      ['Brian Eno', 'Aphex Twin', 'Boards of Canada', 'Enya', 'Vangelis', 'Tycho', 'Sigur Rós', 'Ólafur Arnalds', 'Nils Frahm', 'Max Richter', 'Jon Hopkins',
        'Bonobo', 'Air', 'Tangerine Dream', 'Harold Budd', 'Moby', 'Biosphere#8291', 'The Orb', 'Marconi Union', 'Mike Oldfield', 'Hans Zimmer', 'Hammock']],
  ] },
  Funk: { because: 'el funk', lists: [
    ['funk-legendario', 'Funk legendario', 'El ritmo que no te deja sentado',
      ['James Brown', 'Earth, Wind & Fire', 'Stevie Wonder', 'Parliament', 'Funkadelic', 'Kool & The Gang', 'CHIC', 'Sly & The Family Stone', 'Prince',
        'Rick James', 'The Gap Band', 'Chaka Khan', 'Jamiroquai', 'Commodores', 'Ohio Players', 'Cameo', 'The Meters', 'Tower Of Power', 'Curtis Mayfield',
        'The Isley Brothers', 'Bee Gees', 'Donna Summer', 'Vulfpeck', 'Sister Sledge']],
  ] },
  'R&B/Soul': { because: 'el R&B y el soul', lists: [
    ['soul-legendario', 'R&B y soul legendario', 'Las voces más grandes del soul y el R&B',
      ['Aretha Franklin', 'Marvin Gaye', 'Stevie Wonder', 'Otis Redding', 'Ray Charles', 'Sam Cooke', 'Al Green', 'Whitney Houston', 'Amy Winehouse',
        'Alicia Keys', 'Usher', 'Beyoncé', 'Mary J. Blige', 'Lauryn Hill#1117', 'Erykah Badu', "D'Angelo", 'Frank Ocean', 'SZA', 'TLC', "Destiny's Child",
        'Bill Withers', 'The Temptations', 'Etta James', 'John Legend']],
  ] },
  'Lo-Fi': { because: 'el lo-fi', lists: [
    ['lofi-esencial', 'Lo-fi esencial', 'Ritmos tranquilos para estudiar o desconectar',
      ['Nujabes', 'J Dilla', 'Joji', 'idealism', 'Kupla', 'jinsang', 'tomppabeats', 'potsu', 'eevee', 'SwuM', 'Elijah Who', 'Philanthrope',
        'Saib', 'In Love With a Ghost', 'Powfu', 'Sleepy Fish', 'Madlib', 'MF DOOM', 'L.Dre', 'Tom Misch', 'FKJ']],
  ] },
  Dubstep: { because: 'el dubstep', lists: [
    ['dubstep-esencial', 'Dubstep esencial', 'Los bajos más grandes',
      ['Skrillex', 'Excision', 'Zeds Dead', 'Flux Pavilion', 'Knife Party', 'NERO', 'Rusko', 'Burial', 'Skream', 'Benga', 'Datsik', 'Zomboy', 'Virtual Riot',
        'Subtronics', 'Doctor P', 'Borgore', 'Bassnectar', 'Modestep', 'Feed Me', 'Kill The Noise', 'Seven Lions', 'ILLENIUM', 'NGHTMRE', 'Magnetic Man']],
  ] },
  'Drum & Bass': { because: 'el drum & bass', lists: [
    ['dnb-esencial', 'Drum & bass esencial', 'Velocidad y graves',
      ['Pendulum', 'Chase & Status', 'Sub Focus', 'Netsky', 'Noisia', 'Goldie', 'Andy C', 'High Contrast', 'Wilkinson', 'Dimension', 'Sigma', 'Rudimental',
        'LTJ Bukem', 'Roni Size', 'DJ Fresh', 'Camo & Krooked', 'Hybrid Minds', 'Shy FX', 'Calibre', 'London Elektricity', 'Friction', 'Culture Shock',
        'Metrik', 'Koven']],
  ] },
  Reggaeton: { because: 'el reguetón', lists: ['regueton-imprescindible'] },
  Trap: { because: 'el trap', lists: [
    ['trap-en-espanol', 'Trap y urbano en español', 'Lo que suena en la calle',
      ['Duki', 'Eladio Carrión', 'Anuel AA', 'Bryant Myers', 'Myke Towers', 'Yung Beef', 'Kidd Keo', 'Cruz Cafuné', 'Quevedo', 'Morad', 'Beny Jr', 'JC Reyes',
        'Saiko', 'Bad Gyal', 'Mora', 'Young Miko', 'Jhayco', 'Arcángel', 'De La Ghetto', 'KHEA', 'YSY A', 'Lucho RK', 'La Pantera', 'Bad Bunny']],
    ['trap-internacional', 'Trap internacional', 'Los nombres grandes del trap',
      ['Travis Scott', 'Future', 'Migos', 'Young Thug', '21 Savage', 'Lil Baby', 'Gunna', 'Playboi Carti', 'Lil Uzi Vert', 'Post Malone', 'Cardi B',
        'Metro Boomin', 'Gucci Mane', 'Chief Keef', 'XXXTENTACION', 'Juice WRLD', 'Pop Smoke', 'Don Toliver', 'A$AP Rocky', 'Kodak Black', 'Offset',
        'Roddy Ricch', 'DaBaby', 'Central Cee']],
  ] },
  Flamenco: { because: 'el flamenco', lists: [
    ['flamenco-y-rumba', 'Flamenco y rumba', 'Del cante jondo a la rumba de siempre',
      ['Camarón de la Isla', 'Paco de Lucía', 'Enrique Morente', 'Estrella Morente', 'Niña Pastori', 'Diego El Cigala', 'José Mercé', 'Vicente Amigo',
        'Tomatito', 'Ketama', 'Los Chichos', 'Los Chunguitos', 'Gipsy Kings', 'Peret', 'Rosario', 'Lola Flores', 'El Barrio', 'Kiko Veneno', 'Raimundo Amador',
        'Miguel Poveda', 'Manzanita', 'Los Delinqüentes', 'Chambao', 'Ojos de Brujo', 'Rosalía', 'Israel Fernández']],
  ] },
  'K-Pop': { because: 'el K-pop', lists: [
    ['kpop-imprescindible', 'K-pop imprescindible', 'Los grupos que conquistaron el mundo',
      ['BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'NewJeans', 'EXO', 'Red Velvet', 'SEVENTEEN', 'ITZY', 'aespa', '(G)I-DLE', 'TOMORROW X TOGETHER', 'ENHYPEN',
        'IVE', 'LE SSERAFIM', 'PSY', 'BIGBANG', "Girls' Generation", 'SHINee', 'MAMAMOO', 'ATEEZ', 'Jung Kook', 'LISA', 'ROSÉ']],
  ] },
  Country: { because: 'el country', lists: [
    ['country-legendario', 'Country legendario', 'De Nashville al mundo',
      ['Johnny Cash', 'Dolly Parton', 'Willie Nelson', 'Garth Brooks', 'Shania Twain', 'Kenny Rogers', 'Luke Combs', 'Morgan Wallen', 'Chris Stapleton',
        'Carrie Underwood', 'Tim McGraw', 'Blake Shelton', 'Hank Williams', 'Patsy Cline', 'Waylon Jennings', 'Alan Jackson', 'George Strait', 'Zach Bryan',
        'Kacey Musgraves', 'Keith Urban', 'Brooks & Dunn', 'Merle Haggard', 'Loretta Lynn', 'John Denver']],
  ] },
  Blues: { because: 'el blues', lists: [
    ['blues-legendario', 'Blues legendario', 'Los maestros de las doce barras',
      ['B.B. King', 'Muddy Waters', 'Robert Johnson', "Howlin' Wolf", 'John Lee Hooker', 'Stevie Ray Vaughan', 'Eric Clapton', 'Etta James', 'Buddy Guy',
        'Albert King', 'Freddie King', 'Gary Moore', 'Joe Bonamassa', 'Elmore James', 'T-Bone Walker', 'Bonnie Raitt', "Keb' Mo'", 'Gary Clark Jr.',
        'Janis Joplin', 'The Allman Brothers Band', 'ZZ Top', 'Rory Gallagher', 'Otis Rush', 'Ray Charles']],
  ] },
  Disco: { because: 'la música disco', lists: [
    ['disco-de-siempre', 'Disco de siempre', 'La bola de espejos no para',
      ['Bee Gees', 'Donna Summer', 'ABBA', 'Gloria Gaynor', 'Earth, Wind & Fire', 'CHIC', 'KC & The Sunshine Band', 'Village People', 'Boney M.',
        'Sister Sledge', 'The Trammps', 'Diana Ross', 'Barry White', 'Kool & The Gang', 'The Jacksons', 'Baccara', 'Giorgio Moroder', 'Sylvester',
        'Amii Stewart', 'Thelma Houston', 'Chaka Khan', 'Tavares', 'Anita Ward', 'Blondie']],
  ] },
  Salsa: { because: 'la salsa', lists: [
    ['salsa-y-bachata', 'Salsa y bachata', 'Para bailar pegados',
      ['Héctor Lavoe', 'Celia Cruz', 'Marc Anthony', 'Rubén Blades', 'Willie Colón', 'Fania All Stars', 'El Gran Combo de Puerto Rico', 'Gilberto Santa Rosa',
        "Oscar D'León", 'Joe Arroyo', 'Grupo Niche', 'Juan Luis Guerra', 'Tito Puente', 'La India', 'Víctor Manuelle', 'Frankie Ruiz', 'Eddie Santiago',
        'Jerry Rivera', 'Romeo Santos', 'Aventura', 'Prince Royce', 'Luis Enrique', 'Los Van Van', 'Tito Nieves']],
  ] },
  '80s': { because: 'la música de los 80', lists: [
    ['anos-80', 'Lo mejor de los 80', 'La década de los sintetizadores y los estribillos gigantes',
      ['a-ha', 'Michael Jackson', 'Madonna', 'Prince', 'Queen', 'Duran Duran', 'Depeche Mode', 'The Cure', 'Tears For Fears', 'Eurythmics', 'Cyndi Lauper',
        'Wham!', 'Bon Jovi', 'Europe', 'TOTO', 'Phil Collins', 'Whitney Houston', 'Rick Astley', 'Culture Club', 'Simple Minds', 'Survivor', 'Bonnie Tyler',
        'Alphaville', 'Pet Shop Boys', 'Journey', 'Mecano']],
  ] },
  '90s': { because: 'la música de los 90', lists: [
    ['anos-90', 'Lo mejor de los 90', 'Del grunge a las boy bands',
      ['Nirvana', 'Oasis', 'Backstreet Boys', 'Spice Girls', 'Britney Spears', 'Alanis Morissette', 'The Cranberries', 'R.E.M.', 'Red Hot Chili Peppers',
        'Radiohead', 'No Doubt', 'TLC', 'Ace of Base', 'Robbie Williams', 'Take That', 'Shakira', 'Ricky Martin', 'Blur', 'The Offspring', 'Green Day',
        'Mariah Carey', 'Céline Dion', 'Natalie Imbruglia', 'The Verve', 'Jamiroquai', '4 Non Blondes']],
  ] },
  '2000s': { because: 'la música de los 2000', lists: [
    ['anos-2000', 'Lo mejor de los 2000', 'Los éxitos de principios de siglo',
      ['Linkin Park', 'Eminem', 'Coldplay', 'Beyoncé', 'Rihanna', 'Shakira', 'The Killers', 'Black Eyed Peas', 'Nelly Furtado', 'Avril Lavigne', 'Evanescence',
        '50 Cent', 'Usher', 'OutKast', 'Justin Timberlake', 'Amy Winehouse', 'Kanye West', 'Maroon 5', 'Juanes', 'La Oreja de Van Gogh', 'El Canto del Loco',
        'Daddy Yankee', 'Lady Gaga', 'P!nk', 'Christina Aguilera', 'Nickelback']],
  ] },
  Soundtrack: { because: 'las bandas sonoras', lists: [
    ['bandas-sonoras', 'Bandas sonoras de cine', 'La música de las películas que no se olvidan',
      ['Hans Zimmer', 'John Williams', 'Ennio Morricone', 'Howard Shore', 'James Horner', 'Danny Elfman', 'Alan Silvestri', 'Ludwig Göransson', 'Vangelis',
        'Ramin Djawadi', 'Michael Giacchino', 'Thomas Newman', 'Alexandre Desplat', 'Joe Hisaishi', 'Nino Rota', 'Henry Mancini', 'John Barry',
        'Jerry Goldsmith', 'James Newton Howard', 'Harry Gregson-Williams', 'Klaus Badelt', 'Yann Tiersen', 'Clint Mansell', 'Alan Menken']],
  ] },
  Trance: { because: 'el trance', lists: [
    ['trance-esencial', 'Trance esencial', 'Subidas eternas',
      ['Armin van Buuren', 'Above & Beyond', 'Paul van Dyk', 'Tiësto', 'ATB', 'Ferry Corsten', 'Gareth Emery', 'Dash Berlin', 'Aly & Fila', 'Markus Schulz',
        'Cosmic Gate', 'Darude', 'Robert Miles', 'Chicane', 'Paul Oakenfold', 'Infected Mushroom', 'Vini Vici', 'Andrew Rayel', 'W&W', 'Giuseppe Ottaviani',
        'Rank 1', 'Binary Finary', 'Alice DJ', 'Faithless']],
  ] },
  Cantautores: { because: 'los cantautores', lists: [
    ['cantautores', 'Cantautores imprescindibles', 'Canciones con letra, de aquí y de allá',
      ['Joaquín Sabina', 'Joan Manuel Serrat', 'Silvio Rodríguez', 'Pablo Milanés', 'Luis Eduardo Aute', 'Víctor Manuel', 'Ana Belén', 'Ismael Serrano',
        'Pedro Guerra', 'Rozalén', 'Jorge Drexler', 'Fito Páez', 'Quique González', 'Xoel López', 'Andrés Suárez', 'Marwan', 'Pablo López', 'Vanesa Martín',
        'Rosana', 'Javier Krahe', 'Mercedes Sosa', 'Facundo Cabral', 'Chavela Vargas', 'Alberto Cortez']],
  ] },
  Canarias: { because: 'la música canaria', lists: [
    ['hecho-en-canarias', 'Hecho en Canarias', 'De las islas para el mundo',
      ['Quevedo', 'Cruz Cafuné', 'Bejo', 'Don Patricio', 'Lucho RK', 'La Pantera', 'Maikel Delacalle', 'Ptazeta', 'Juseph', 'Abhir Hathi', 'Efecto Pasillo',
        'Pedro Guerra', 'Rosana', 'Los Sabandeños', 'Los Gofiones', 'Mestisay', 'Taburiente', 'Braulio', 'José Vélez', 'Danny Romero', 'K-Narias', 'Agoney',
        'Locoplaya', 'El Vega']],
  ] },
  Afrobeats: { because: 'el afrobeats', lists: [
    ['afrobeats-esencial', 'Afrobeats esencial', 'El sonido de África que suena en todo el mundo',
      ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Tems', 'CKay', 'Fireboy DML', 'Asake', 'Ayra Starr', 'Omah Lay', 'Tiwa Savage', 'Mr Eazi', 'Fela Kuti', 'Tyla',
        'Kizz Daniel', 'Joeboy', 'Oxlade', 'Yemi Alade', 'Black Sherif', 'Libianca', 'Ruger', 'Victony', 'BNXN', 'Olamide']],
  ] },
  Eurodance: { because: 'el dance de los 90', lists: [
    ['dance-de-los-90', 'Dance de los 90', 'Los himnos de la discoteca y la ruta',
      ['Haddaway', 'Snap!', '2 Unlimited', 'Corona', 'La Bouche', 'Culture Beat', 'Eiffel 65', 'Aqua', 'Ace of Base', 'Vengaboys', 'Scooter', 'Dr. Alban',
        'Technotronic', 'Real McCoy', 'Gala', 'Alice DJ', 'ATB', 'Darude', 'Sash!', 'Robert Miles', "Gigi D'Agostino", 'Cascada', 'Whigfield',
        'Black Box', 'Chimo Bayo']],
  ] },
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/\by\b/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Caché en disco para poder repetir la generación sin volver a pedirlo todo
const CACHE = path.join(os.tmpdir(), 'esputi-legends-cache.json')
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
let last = 0
async function api(p) {
  if (cache[p]) return cache[p]
  for (let n = 0; n < 6; n++) {
    const wait = last + 130 - Date.now(); if (wait > 0) await sleep(wait)
    last = Date.now()
    const r = await fetch('https://api.deezer.com/' + p, { headers: { 'Accept-Language': 'es-ES,es;q=0.9' } }).then((x) => x.json()).catch(() => null)
    if (r && !r.error) { cache[p] = r; return r }
    await sleep(2500)
  }
  throw new Error('Sin respuesta: ' + p)
}

async function findArtist(name) {
  // "Nombre#id": identificador fijo del catálogo
  const fixed = name.match(/^(.*)#(\d+)$/)
  if (fixed) return { ...(await api('artist/' + fixed[2])), name: fixed[1] }
  const list = (await api('search/artist?limit=25&q=' + encodeURIComponent(name))).data || []
  const n = norm(name)
  const same = list.filter((a) => norm(a.name) === n).sort((a, b) => b.nb_fan - a.nb_fan)
  if (same[0]) return same[0]
  const near = list.filter((a) => norm(a.name).startsWith(n) || n.startsWith(norm(a.name))).sort((a, b) => b.nb_fan - a.nb_fan)
  if (near[0] && near[0].nb_fan > 20000) { console.log(`  ~ ${name} → ${near[0].name} (${near[0].nb_fan})`); return near[0] }
  console.log(`  ✗ ${name}: no encontrado (${list.slice(0, 3).map((a) => a.name).join(', ')})`)
  return null
}

// Fuera las coletillas de reedición: se ve mejor y se empareja mejor
const clean = (t) => t.replace(/\s*[([][^)\]]*(remaster|remasteriz|\bmono\b|\bstereo\b|anniversary|deluxe)[^)\]]*[)\]]/gi, '')
  .replace(/\s+-\s+[^-]*(remaster|remasteriz|\bmono\b|\bstereo\b)[^-]*$/i, '').replace(/\s+remasteriz\w+(\s+\d{4})?$/i, '').trim()
// Versiones que no son "la" canción, títulos kilométricos o en otro alfabeto
const JUNK = /\b(live|en vivo|en directo|directo|karaoke|instrumental|remix|acoustic|acústic|demo|edit|version|versión|mix|recorded at|great for|medley)\b|[　-鿿Ѐ-ӿ]|.{75}/i

async function topTracks(a) {
  const list = (await api(`artist/${a.id}/top?limit=30`)).data || []
  const seen = new Set(), out = []
  const push = (t) => {
    const title = clean(t.title), k = norm(title.replace(/\s*[([].*$/, ''))
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push({
      id: t.id, title, artist: t.artist?.id === a.id ? a.name : t.artist?.name || a.name, artistId: t.artist?.id || a.id, album: clean(t.album?.title || ''), albumId: t.album?.id || 0,
      duration: t.duration || 0, cover: t.album?.cover_medium || '', rank: t.rank || 0,
    })
  }
  const own = list.filter((t) => t.artist?.id === a.id)
  own.filter((t) => !JUNK.test(t.title)).forEach(push)
  if (out.length < PER_ARTIST) own.forEach(push)
  if (out.length < PER_ARTIST) list.forEach(push)
  return out.slice(0, PER_ARTIST)
}

const pic = (a) => (String(a.picture_medium || '').match(/\/artist\/([0-9a-f]{32})\//) || [])[1] || ''
const index = {}, done = {}
fs.mkdirSync('public/legends', { recursive: true })
for (const [genre, g] of Object.entries(GENRES)) {
  index[genre] = { because: g.because, lists: [] }
  for (const entry of g.lists) {
    // Solo el identificador: una lista ya definida en otro estilo (se comparte)
    if (typeof entry === 'string') { index[genre].lists.push(done[entry]); continue }
    const [id, name, description, names] = entry
    console.log(`${genre} · ${name}`)
    const artists = [], per = []
    for (const n of names) {
      const a = await findArtist(n)
      if (!a) continue
      const tracks = await topTracks(a)
      if (!tracks.length) { console.log(`  ✗ ${n}: sin canciones`); continue }
      artists.push([a.id, a.name, pic(a)])
      per.push(tracks)
    }
    // Primero el gran éxito de cada grupo, luego el segundo, luego el tercero
    const tracks = []
    for (let i = 0; i < PER_ARTIST; i++) for (const l of per) if (l[i]) tracks.push(l[i])
    const cover = artists[0]?.[2] ? `https://cdn-images.dzcdn.net/images/artist/${artists[0][2]}/500x500-000000-80-0-0.jpg` : ''
    fs.writeFileSync(`public/legends/${id}.json`, JSON.stringify({ id, genre, name, description, cover, tracks }))
    // El índice guarda solo [id, nombre, huella de la foto] de cada artista: la dirección se monta en la app
    done[id] = { id, name, description, artists: artists.slice(0, 12) }
    index[genre].lists.push(done[id])
    console.log(`  ${artists.length} artistas, ${tracks.length} canciones`)
    fs.writeFileSync(CACHE, JSON.stringify(cache))
  }
}
fs.writeFileSync('src/lib/legends.json', JSON.stringify(index))
console.log('Hecho: src/lib/legends.json y public/legends/*.json')
