/** Where the gaps of a read are attributed: the window, an error node, a routing of a node. */
export interface ReadScope {
  readonly parent?: ReadScope;
}
