export const familyData = [
  {
    id: 'h1',
    name: 'Ahmad bin Hasan',
    gender: 'male',
    birth: '1970-05-12',
    death: null,
    fatherId: '', motherId: '',
    spouses: [
      { id: 'w1', type: 'married', marriageDate: '1995-02-14' },
      { id: 'w2', type: 'married', marriageDate: '2005-08-08' },
      { id: 'w3', type: 'married', marriageDate: '2015-12-12' }
    ],
    photo: ''
  },
  {
    id: 'w1',
    name: 'Siti Aminah (Istri 1)',
    gender: 'female',
    birth: '1972-02-14',
    death: '2020-01-01',
    fatherId: '', motherId: '',
    spouses: [{ id: 'h1', type: 'married', marriageDate: '1995-02-14' }],
    photo: ''
  },
  {
    id: 'w2',
    name: 'Ratna Sari (Istri 2)',
    gender: 'female',
    birth: '1978-10-20',
    death: null,
    fatherId: '', motherId: '',
    spouses: [{ id: 'h1', type: 'married', marriageDate: '2005-08-08' }],
    photo: ''
  },
  {
    id: 'w3',
    name: 'Dewi Lestari (Istri 3)',
    gender: 'female',
    birth: '1985-04-10',
    death: null,
    fatherId: '', motherId: '',
    spouses: [{ id: 'h1', type: 'married', marriageDate: '2015-12-12' }],
    photo: ''
  },
  // Keturunan (Anak-anak)
  {
    id: 'c1',
    name: 'Bambang Ahmad',
    gender: 'male',
    birth: '1996-06-15',
    death: null,
    fatherId: 'h1', motherId: 'w1',
    spouses: [],
    photo: ''
  },
  {
    id: 'c2',
    name: 'Aisyah Ahmad',
    gender: 'female',
    birth: '2006-11-30',
    death: null,
    fatherId: 'h1', motherId: 'w2',
    spouses: [],
    photo: ''
  },
  {
    id: 'step1',
    name: 'Rudi Tiri (Bawaan Istri 2)',
    gender: 'male',
    birth: '1999-03-05', // Lebih tua dari pernikahan dengan Ahmad
    death: null,
    fatherId: '', motherId: 'w2',
    spouses: [],
    photo: ''
  },
  {
    id: 'c3',
    name: 'Dika Ahmad',
    gender: 'male',
    birth: '2016-07-07',
    death: null,
    fatherId: 'h1', motherId: 'w3',
    spouses: [],
    photo: ''
  }
];
