import * as React from 'react'
import {
  ChakraProvider,
  Box,
  Flex,
  theme,
  Heading,
  Text,
  Tooltip,
  useClipboard,
  VStack,
  Stack,
  Input,
  Button,
  Grid,
  GridItem,
  Thead,
  Tbody,
  Table,
  Th,
  Tr,
  Td,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  TableCaption,
  Center,
} from '@chakra-ui/react'
import { ColorModeSwitcher } from './ColorModeSwitcher'
import { distance, ENR, fromHex } from '@chainsafe/discv5'
import {
  getHistoryNetworkContentId,
  PortalNetwork,
  reassembleBlock,
  SubNetworkIds,
} from 'portalnetwork'
import PeerId from 'peer-id'
import { Multiaddr } from 'multiaddr'
import { Block } from '@ethereumjs/block'
import DisplayBlock from './Components/DisplayBlock'
import CircleNetwork from './Components/CircleNetwork'
import { ArrowLeftIcon, CopyIcon } from '@chakra-ui/icons'
import DevTools from './Components/DevTools'

// export const lightblue = '#bee3f8'
export const lightblue = theme.colors.blue[100]
export const mediumblue = theme.colors.blue[200]
export const App = () => {
  const [portal, setPortal] = React.useState<PortalNetwork>()
  const [peers, setPeers] = React.useState<ENR[] | undefined>([])
  const [sortedDistList, setSortedDistList] = React.useState<[number, string[]][]>([])
  const [enr, setENR] = React.useState<string>('')
  const [id, setId] = React.useState<string>('')
  const [peerEnr, setPeerEnr] = React.useState('')
  const [contentKey, setContentKey] = React.useState<string>(
    '0x7aaadeb8cf3e1dfda9f60fd41ea6204efa4cabcba89e61881ad475d50e63dfd0'
  )
  const [parentHash, setParentHash] = React.useState('')
  const [proxy, setProxy] = React.useState('127.0.0.1')
  const [block, setBlock] = React.useState<Block>()
  const { onCopy } = useClipboard(enr)
  const { isOpen, onOpen, onClose } = useDisclosure()

  const init = async () => {
    if (portal?.client.isStarted()) {
      await portal.stop()
    }
    const id = await PeerId.create({ keyType: 'secp256k1' })
    const enr = ENR.createFromPeerId(id)
    setId(enr.nodeId)
    enr.setLocationMultiaddr(new Multiaddr('/ip4/127.0.0.1/udp/0'))
    const node = new PortalNetwork(
      {
        enr: enr,
        peerId: id,
        multiaddr: new Multiaddr('/ip4/127.0.0.1/udp/0'),
        transport: 'wss',
        proxyAddress: `ws://${proxy}:5050`,
      },
      2n ** 256n
    )
    // eslint-disable-next-line no-undef
    ;(window as any).portal = portal
    // eslint-disable-next-line no-undef
    ;(window as any).Multiaddr = Multiaddr
    // eslint-disable-next-line no-undef
    ;(window as any).ENR = ENR
    setPortal(node)
    node.client.on('multiaddrUpdated', () =>
      setENR(node.client.enr.encodeTxt(node.client.keypair.privateKey))
    )
    await node.start()

    node.enableLog('*ultralight*, *portalnetwork*, *<uTP>*')
  }

  const copy = async () => {
    await setENR(portal?.client.enr.encodeTxt(portal.client.keypair.privateKey) ?? '')
    onCopy()
  }

  function updateAddressBook() {
    const routingTable = portal?.routingTables.get(SubNetworkIds.HistoryNetwork)
    const known = routingTable?.values()
    const map: Record<number, string[]> = {}
    known!.forEach((_enr: ENR) => {
      const distToSelf = distance(id, _enr.nodeId)
      map[Math.ceil(Number(((distToSelf * 1000n) / 2n ** 256n) * 256n) / 1000)] = [
        `${_enr.ip}`,
        `${_enr.getLocationMultiaddr('udp')?.nodeAddress().port}`,
      ]
    })
    const selected = Object.keys(map).map((n) => {
      return parseInt(n)
    })
    const sorted = selected.sort((a, b) => a - b)
    const table: [number, string[]][] = sorted.map((d) => {
      return [d, map[d]]
    })
    setSortedDistList(table)
    const peers = portal!.routingTables.get(SubNetworkIds.HistoryNetwork)!.values()
    setPeers(peers)
  }

  React.useEffect(() => {
    portal?.on('NodeAdded', () => updateAddressBook())
    portal?.on('NodeRemoved', () => updateAddressBook())
  }, [portal])

  async function handleClick() {
    await portal?.sendPing(peerEnr, SubNetworkIds.HistoryNetwork)
    updateAddressBook()
  }

  async function handleFindContent(): Promise<Block | void> {
    if (portal) {
      if (contentKey.slice(0, 2) !== '0x') {
        setContentKey('')
      } else {
        const headerlookupKey = getHistoryNetworkContentId(1, contentKey, 0)
        const bodylookupKey = getHistoryNetworkContentId(1, contentKey, 1)
        let header
        let body
        await portal.historyNetworkContentLookup(0, contentKey)
        try {
          header = await portal.db.get(headerlookupKey)
        } catch (err: any) {
          portal.logger(err.message)
        }
        await portal.historyNetworkContentLookup(1, contentKey)
        try {
          body = await portal.db.get(bodylookupKey)
        } catch (err: any) {
          portal.logger(err.message)
        }
        try {
          const block = reassembleBlock(
            fromHex(header.slice(2)),
            typeof body === 'string' ? fromHex(body.slice(2)) : body
          )
          setBlock(block)
          return block
        } catch (err: any) {
          portal.logger(err.message)
        }
      }
    }
  }

  async function findParent(hash: string) {
    setContentKey(hash)
    await handleFindContent()
    portal?.logger('Showing Block')
  }

  React.useEffect(() => {
    setContentKey(parentHash)
    handleFindContent()
  }, [parentHash])

  return (
    <ChakraProvider theme={theme}>
      <Box bg={lightblue}>
        <ColorModeSwitcher justifySelf="flex-end" />
        <Heading size="2xl" textAlign="start">
          Ultralight Portal Network Explorer
        </Heading>
      </Box>
      {portal ? (
        <Box bg={mediumblue}>
          <Button onClick={onOpen}>DEVTOOLS</Button>
          <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
            <DrawerOverlay />
            <DrawerContent>
              <DrawerCloseButton />
              <DrawerHeader>Manually Interact with Network</DrawerHeader>
              <DrawerBody>
                <DevTools portal={portal} peers={peers!} />
              </DrawerBody>
              <DrawerFooter>
                <Button onClick={onClose}>CLOSE</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          <Grid templateColumns="repeat(15, 1fr)" templateRows="repeat(2, 1fr)">
            <GridItem colSpan={9} rowSpan={2}>
              <Tooltip label="click to copy">
                <Text fontSize={'sm'} onClick={copy} wordBreak="break-all" cursor="pointer">
                  {portal?.client.enr.encodeTxt(portal.client.keypair.privateKey)}
                </Text>
              </Tooltip>
            </GridItem>
            <GridItem rowSpan={2} colSpan={6} colStart={10}>
              <CopyIcon />
            </GridItem>
          </Grid>
        </Box>
      ) : (
        <Box bg={lightblue}>
          <Input
            onChange={(evt) => {
              setProxy(evt.target.value)
            }}
            textAlign="center"
            bg="whiteAlpha.800"
            defaultValue={'127.0.0.1'}
            placeholder="Proxy IP Address"
          />
          <Center>
            <Button onClick={init}>Start Node</Button>
          </Center>
        </Box>
      )}
      <Flex bg={lightblue} justify="center" paddingBottom={'100%'}>
        <Grid templateColumns={'repeat(12, 1fr)'}>
          {portal && (
            <>
              <GridItem padding={2} colSpan={3}>
                <Button width={'100%'} onClick={handleClick}>
                  Connect To Node
                </Button>
              </GridItem>
              <GridItem paddingY={2} colSpan={9} colStart={4}>
                <Input
                  bg="whiteAlpha.800"
                  value={peerEnr}
                  placeholder={'Node ENR'}
                  onChange={(evt) => setPeerEnr(evt.target.value)}
                />
              </GridItem>
            </>
          )}
          {peers && peers.length > 0 && (
            <GridItem colSpan={6} rowStart={2}>
              <Box>
                <Table size="xs">
                  <TableCaption>Peers: {peers?.length}</TableCaption>
                  <Thead>
                    <Th>ENR</Th>
                    <Th>DIST</Th>
                    <Th>IP</Th>
                    <Th>PORT</Th>
                  </Thead>
                  <Tbody>
                    {sortedDistList.map((peer) => {
                      return (
                        <Tr>
                          <Td>
                            <CopyIcon />
                          </Td>
                          <Th>{peer[0]}</Th>
                          <Td>{peer[1][0]}</Td>
                          <Td>{peer[1][1]}</Td>
                        </Tr>
                        //{' '}
                      )
                    })}
                  </Tbody>
                </Table>
              </Box>
              {portal && <CircleNetwork peers={peers} distances={sortedDistList} />}
            </GridItem>
          )}
          <GridItem colStart={7} colSpan={6}>
            <VStack>
              <VStack justify="center">
                <Stack direction="row"></Stack>
                <Grid
                  columnGap={4}
                  rowGap={4}
                  templateColumns={'repeat(4, 1fr)'}
                  templateRows={'repeat(2, 1fr)'}
                >
                  {portal && <> </>}
                  {peers && peers.length > 0 && (
                    <>
                      <GridItem colSpan={1}>
                        <Button onClick={() => handleFindContent()}>Get Block by Blockhash</Button>
                      </GridItem>
                      <GridItem colSpan={3} colStart={2}>
                        <Input
                          bg="whiteAlpha.800"
                          placeholder={'Block Hash'}
                          value={contentKey}
                          onChange={(evt) => {
                            setContentKey(evt.target.value)
                          }}
                        />
                      </GridItem>
                    </>
                  )}
                </Grid>
              </VStack>
              {portal && block && (
                <Box border={'solid black'} paddingTop="5">
                  <DisplayBlock
                    setParentHash={setParentHash}
                    findParent={findParent}
                    block={block!}
                  />
                </Box>
              )}
            </VStack>
          </GridItem>
        </Grid>
      </Flex>
      <Grid templateColumns={'repeat(12, 1fr)'}></Grid>
    </ChakraProvider>
  )
}
