import { createReadStream } from 'fs'
import { FileUpload, Upload } from 'graphql-upload'

import { AUDIO_ASSET_TYPE, IMAGE_ASSET_TYPE } from 'common/enums'
import { SystemService } from 'connectors'

import { testClient } from './utils'

const SINGLE_FILE_UPLOAD = /* GraphQL */ `
  fragment Asset on Asset {
    __typename
    id
    path
    type
  }
  mutation SingleFileUpload($input: SingleFileUploadInput!) {
    singleFileUpload(input: $input) {
      __typename
      ...Asset
    }
  }
`
const createUpload = (mimetype: string) => {
  const file = createReadStream(__dirname)
  const fileUpload: FileUpload = {
    createReadStream: () => file,
    filename: 'some-filename',
    mimetype,
    encoding: 'some-encoding',
  }
  const upload = new Upload() as any
  upload.promise = new Promise((r) => r(fileUpload))
  upload.file = fileUpload
  return upload
}

describe('singleFileUpload', () => {
  test('upload files with wrong type', async () => {
    const server = await testClient({ isAuth: true })
    const { errors } = await server.executeOperation({
      query: SINGLE_FILE_UPLOAD,
      variables: {
        input: {
          type: IMAGE_ASSET_TYPE.avatar,
          file: createUpload('audio/mpeg'),
          entityType: 'user',
        },
      },
    })
    expect(errors && errors[0].message).toBe('Invalid image format.')
  })
  test('upload images to cloudflare succeeded', async () => {
    const uploadCfsvc = jest.fn((type, _, uuid) => `${type}/${uuid}`)
    const uploadS3 = jest.fn((type, _, uuid) => `${type}/${uuid}`)
    const systemService = new SystemService()
    systemService.cfsvc.baseUploadFile = uploadCfsvc as any
    systemService.aws.baseUploadFile = uploadS3 as any

    const server = await testClient({
      isAuth: true,
      dataSources: { systemService },
    })
    const { errors } = await server.executeOperation({
      query: SINGLE_FILE_UPLOAD,
      variables: {
        input: {
          type: IMAGE_ASSET_TYPE.avatar,
          file: createUpload('image/jpeg'),
          entityType: 'user',
        },
      },
    })
    expect(uploadCfsvc).toHaveBeenCalled()
    expect(uploadS3).not.toHaveBeenCalled()
    expect(errors).toBeUndefined()
  })
  test('upload not-image files to s3 succeeded', async () => {
    const uploadCfsvc = jest.fn((type, _, uuid) => `${type}/${uuid}`)
    const uploadS3 = jest.fn((type, _, uuid) => `${type}/${uuid}`)
    const systemService = new SystemService()
    systemService.cfsvc.baseUploadFile = uploadCfsvc as any
    systemService.aws.baseUploadFile = uploadS3 as any

    const server = await testClient({
      isAuth: true,
      dataSources: { systemService },
    })
    const { errors } = await server.executeOperation({
      query: SINGLE_FILE_UPLOAD,
      variables: {
        input: {
          type: AUDIO_ASSET_TYPE.embedaudio,
          file: createUpload('audio/mpeg'),
          entityType: 'user',
        },
      },
    })
    expect(uploadCfsvc).not.toHaveBeenCalled()
    expect(uploadS3).toHaveBeenCalled()
    expect(errors).toBeUndefined()
  })
})
