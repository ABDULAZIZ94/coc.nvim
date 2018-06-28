import * as UUID from './utils/uuid'
import * as Is from './utils/is'
import {ProviderResult} from '../provider'
import {documentSelectorToLanguageIds} from './utils/converter'
import languages from '../languages'

import {
  Position,
  Definition,
  Disposable,
  TextDocument,
  ClientCapabilities,
  CancellationToken,
  ServerCapabilities,
  TextDocumentRegistrationOptions,
  DocumentSelector,
  TypeDefinitionRequest
} from 'vscode-languageserver-protocol'

import {TextDocumentFeature, BaseLanguageClient} from './client'

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
  if (target[key] === void 0) {
    target[key] = {} as any
  }
  return target[key]
}

export interface ProvideTypeDefinitionSignature {
  (
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<Definition>
}

export interface TypeDefinitionMiddleware {
  provideTypeDefinition?: (
    this: void,
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    next: ProvideTypeDefinitionSignature
  ) => ProviderResult<Definition>
}

export class TypeDefinitionFeature extends TextDocumentFeature<TextDocumentRegistrationOptions> {
  constructor(client: BaseLanguageClient) {
    super(client, TypeDefinitionRequest.type)
  }

  public fillClientCapabilities(capabilites: ClientCapabilities): void {
    ensure(ensure(capabilites, 'textDocument')!,'typeDefinition')!.dynamicRegistration = true
  }

  public initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
    if (!capabilities.typeDefinitionProvider) {
      return
    }
    if (capabilities.typeDefinitionProvider === true) {
      if (!documentSelector) {
        return
      }
      this.register(this.messages, {
        id: UUID.generateUuid(),
        registerOptions: Object.assign({}, {documentSelector: documentSelector})
      })
    } else {
      const implCapabilities = capabilities.typeDefinitionProvider
      const id = Is.string(implCapabilities.id) && implCapabilities.id.length > 0
          ? implCapabilities.id
          : UUID.generateUuid()
      const selector = implCapabilities.documentSelector || documentSelector
      if (selector) {
        this.register(this.messages, {
          id,
          registerOptions: Object.assign({}, {documentSelector: selector})
        })
      }
    }
  }

  protected registerLanguageProvider(options: TextDocumentRegistrationOptions): Disposable {
    let client = this._client
    let provideTypeDefinition: ProvideTypeDefinitionSignature = (document, position, token) => {

      return client.sendRequest(TypeDefinitionRequest.type, {textDocument: document, position}, token)
        .then(res => { res }, error => {
          client.logFailedRequest(TypeDefinitionRequest.type, error)
          return Promise.resolve(null)
        })
    }
    let middleware = client.clientOptions.middleware!
    let languageIds = documentSelectorToLanguageIds(options.documentSelector)
    return languages.registerTypeDefinitionProvider(languageIds, {
      provideTypeDefinition: (
        document: TextDocument,
        position: Position,
        token: CancellationToken
      ): ProviderResult<Definition> => {
        return middleware.provideTypeDefinition
          ? middleware.provideTypeDefinition(
              document,
              position,
              token,
              provideTypeDefinition
            )
          : provideTypeDefinition(document, position, token)
      }
    })
  }
}