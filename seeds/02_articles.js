exports.seed = function(knex, Promise) {
  // Deletes ALL existing entries
  return knex('article')
    .del()
    .then(function() {
      // Inserts seed entries
      return knex('article').insert([
        {
          author_id: '1',
          title: 'test article 1',
          cover: 'some-s3-path',
          abstract: 'Some text',
          word_count: '1000',
          hash: 'some-ipfs-hash',
          s3_path: 'some-s3-path',
          publish_state: 'published'
        },
        {
          author_id: '2',
          upstream_id: '1',
          title: 'test article 2',
          cover: 'some-s3-path',
          abstract: 'Some text',
          word_count: '1000',
          hash: 'some-ipfs-hash',
          s3_path: 'some-s3-path',
          publish_state: 'published'
        },
        {
          author_id: '3',
          upstream_id: '2',
          title: 'test article 3',
          cover: 'some-s3-path',
          abstract: 'Some text',
          word_count: '1000',
          hash: 'some-ipfs-hash',
          s3_path: 'some-s3-path',
          publish_state: 'published'
        }
      ])
    })
}
