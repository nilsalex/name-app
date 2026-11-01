// German boys' names, top 200 by aggregated popularity across the
// official "Vornamen Köln" open dataset (seasons 2010-2018),
// https://offenedaten-koeln.de/dataset/vornamen — License: CC BY 3.0
// https://creativecommons.org/licenses/by/3.0/
export const BOY_NAMES: string[] = [
  "Aaron", "Adam", "Adrian", "Ahmet", "Alessandro", "Alessio",
  "Alexander", "Ali", "Amin", "Andreas", "Anton", "Antonio",
  "Aras", "Arda", "Arian", "Arthur", "Bela", "Ben",
  "Benedikt", "Benjamin", "Bruno", "Can", "Carl", "Carlo",
  "Caspar", "Christian", "Clemens", "Constantin", "Damian", "Daniel",
  "David", "Deniz", "Diego", "Dominik", "Efe", "Elias",
  "Emil", "Emilian", "Emilio", "Emin", "Emir", "Emre",
  "Enes", "Eren", "Eric", "Erik", "Fabian", "Fabio",
  "Felix", "Ferdinand", "Finn", "Florian", "Franz", "Frederik",
  "Friedrich", "Fritz", "Fynn", "Gabriel", "Georg", "Hamza",
  "Hannes", "Heinrich", "Hendrik", "Henri", "Henrik", "Henry",
  "Hugo", "Ibrahim", "Ilyas", "Jacob", "Jakob", "Jan",
  "Jannik", "Jannis", "Jason", "Jasper", "Joel", "Johan",
  "Johann", "Johannes", "John", "Jona", "Jonah", "Jonas",
  "Jonathan", "Josef", "Joshua", "Julian", "Julius", "Justus",
  "Kaan", "Karl", "Kerem", "Kian", "Kilian", "Konrad",
  "Konstantin", "Lars", "Lasse", "Leander", "Leandro", "Lennard",
  "Lennart", "Lennox", "Leo", "Leon", "Leonard", "Leonardo",
  "Leopold", "Levi", "Levin", "Liam", "Lian", "Linus",
  "Louis", "Luan", "Luca", "Lucas", "Luis", "Luka",
  "Lukas", "Luke", "Malik", "Malte", "Manuel", "Marc",
  "Maria", "Marlon", "Martin", "Mateo", "Mats", "Matteo",
  "Matthias", "Matti", "Mattis", "Maurice", "Max", "Maxim",
  "Maximilian", "Mehmet", "Mert", "Michael", "Michel", "Miguel",
  "Mika", "Mikail", "Milan", "Milo", "Miran", "Mohamed",
  "Moritz", "Muhammed", "Mustafa", "Nick", "Nico", "Nicolas",
  "Niklas", "Nils", "Noah", "Noel", "Ole", "Oliver",
  "Ömer", "Oscar", "Oskar", "Paul", "Pepe", "Peter",
  "Phil", "Philip", "Philipp", "Piet", "Rafael", "Raphael",
  "Rayan", "Richard", "Robert", "Robin", "Sam", "Samuel",
  "Sebastian", "Semih", "Severin", "Simon", "Stefan", "Theo",
  "Theodor", "Thomas", "Till", "Tim", "Timo", "Titus",
  "Tobias", "Tom", "Toni", "Valentin", "Vincent", "Wilhelm",
  "Yasin", "Yusuf",
];

export type NameScore = { name: string; score: number };

export function defaultScores(): NameScore[] {
  return BOY_NAMES.map((name) => ({ name, score: 0 }));
}
