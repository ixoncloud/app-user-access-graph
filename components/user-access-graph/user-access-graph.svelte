<script lang="ts">
  import * as d3 from 'd3';
  import { onMount } from 'svelte';
  import type { ComponentContext } from '@ixon-cdk/types';
  import { runResizeObserver } from './utils/resize-observer';
  import { UserAccessGraphService } from './user-access-graph.service';
  export let context: ComponentContext;

  let el;
  let rootEl: HTMLDivElement;
  let settings = {
    showCompanyWide: true,
    showMachineSpecific: true,
    showLabels: false,
    showLegend: true,
  };
  let graph,
    data,
    svg,
    legend,
    legendSvg,
    graphSvg,
    color,
    node,
    link,
    circle,
    label;
  let height, width;
  let focusedConnectedEdges: {
    source: { id: string };
    target: { id: string };
  }[] = [];
  let clickedNode;
  let resetButton, settingsButton;

  let labels: { name: string; color: string }[] = [];

  /**
   * Search variables
   */
  let isInputFocused = false;
  let searchInput = '';
  let selectedSearchIndex = -1;
  let results = [];
  let possibleResults = [];
  let searchEl;
  const onInputFocus = () => (isInputFocused = true);
  const onInputBlur = () => (
    (isInputFocused = false), (selectedSearchIndex = -1)
  );

  onMount(() => {
    context.createTooltip(settingsButton, { message: 'Settings' });
    context.createTooltip(resetButton, { message: 'Reset focus' });

    const service = new UserAccessGraphService(context);

    Promise.all([
      service.getGroupTypes(),
      service.getGroups(),
      service.getAgents(),
      service.getUsers(),
      service.getMyCompany(),
    ]).then(apiData => {
      data = apiData;

      const zoom = d3
        .zoom()
        .on('zoom', event => {
          graphSvg.attr('transform', event.transform);

          if (label) {
            let fontSize = 12;
            if (event.transform.k > 10) {
              fontSize = 2;
            } else if (event.transform.k > 3) {
              fontSize = 6;
            }
            label.attr('font-size', fontSize + 'px');
          }
        })
        .scaleExtent([1, 40]);
      svg = d3
        .select(el)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');

      // Disable pointer events to enable dragging of component in edit mode
      if (context.mode !== 'view') {
        svg.style('pointer-events', 'none');
      }

      // Disable double click zoom
      graphSvg = svg.call(zoom).on('dblclick.zoom', null).append('g');

      color = d3.scaleOrdinal(d3.schemeCategory10);

      legendSvg = svg.append('g').selectAll('g');

      drawGraph();
      drawLegend();
    });

    const resizeObservers: ResizeObserver[] = [];
    const resizeObserver = runResizeObserver(rootEl, (rect: DOMRect) => {
      height = rect.height - 60;
      width = rect.width - 30;
    });
    resizeObservers.push(resizeObserver);
  });

  function drawGraph() {
    graph = createGraph(data);

    possibleResults = graph.nodes.filter(
      node => node.group === 3 || node.group === 4,
    );

    var simulation = d3
      .forceSimulation()
      .force(
        'link',
        d3.forceLink().id(function (d) {
          return d.id;
        }),
      )
      .force('charge', d3.forceManyBody())
      .force('center', d3.forceCenter(width / 2, height / 2));

    link = graphSvg
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', '0.6')
      .attr('stroke-width', function (d) {
        return Math.sqrt(d.value);
      });

    node = graphSvg
      .append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(graph.nodes)
      .enter();

    circle = node
      .append('circle')
      .attr('stroke', '#fff')
      .attr('r', 5)
      .attr('fill', function (d) {
        // Return black for company node
        if (d.group === 5) {
          return '#000';
        }
        return color(d.group);
      });

    circle.append('title').text(function (d) {
      let type;
      if (d.group === 1) {
        type = 'Group-type';
      }
      if (d.group === 2) {
        type = 'Group';
      }
      if (d.group === 3) {
        type = 'User';
      }
      if (d.group === 4) {
        type = 'Device';
      }
      if (d.group === 5) {
        type = 'Company';
      }
      return type + ': ' + d.name;
    });

    label = node
      .append('text')
      .attr('dy', '5px')
      .attr('dx', '5px')
      .attr('font-size', '12px')
      .attr('color', 'black')
      .style('pointer-events', 'none')
      .text(function (d) {
        return settings.showLabels ? d.name : '';
      });

    circle.call(
      d3
        .drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended),
    );

    circle.on('click', function (_, d) {
      // If clicked on user or agent
      if (d.group === 3 || d.group === 4) {
        if (clickedNode?.id === d.id && focusedConnectedEdges.length > 0) {
          resetHighlight();
        } else {
          clickedNode = d;
          newSearchInput(d);
          calculateConnectedEdgesAndHighlightElements();
        }
      }
    });

    simulation.nodes(graph.nodes).on('tick', ticked);

    simulation.force('link').links(graph.links);

    function ticked() {
      link
        .attr('x1', function (d) {
          return d.source.x;
        })
        .attr('y1', function (d) {
          return d.source.y;
        })
        .attr('x2', function (d) {
          return d.target.x;
        })
        .attr('y2', function (d) {
          return d.target.y;
        });

      circle
        .attr('cx', function (d) {
          return d.x;
        })
        .attr('cy', function (d) {
          return d.y;
        });

      label
        .attr('x', function (d) {
          return d.x;
        })
        .attr('y', function (d) {
          return d.y - 10;
        });
    }

    function dragstarted(e, d) {
      if (!e.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(e, d) {
      d.fx = e.x;
      d.fy = e.y;
    }

    function dragended(e, d) {
      if (!e.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  function createGraph(data) {
    const groupTypes = data[0];
    const groups = data[1].filter(
      group =>
        !!group.name &&
        !group.agent &&
        (!!group.type || settings.showCompanyWide),
    );
    const machineGroups = data[1].filter(group => !!group.agent);
    const agents = data[2].filter(agent => !!agent.name);
    const users = data[3];
    const company = data[4];

    let pre_graph = {
      nodes: [
        ...groupTypes.map(groupType => ({
          id: groupType.publicId,
          name: groupType.name,
          group: 1,
        })),
        ...groups.map(group => ({
          id: group.publicId,
          name: group.name,
          group: 2,
        })),
        ...users.map(user => ({
          id: user.publicId,
          name: user.name,
          group: 3,
        })),
        ...agents.map(agent => ({
          id: agent.publicId,
          name: agent.name,
          group: 4,
        })),
        {
          id: company.publicId,
          name: company.name,
          group: 5,
        },
      ],
      links: [
        // Group-types to company
        ...groupTypes.map(groupType => ({
          source: groupType.publicId,
          target: company.publicId,
          value: 1,
        })),
        // Company group to company
        ...groups
          .filter(group => !group.type)
          .map(group => ({
            source: group.publicId,
            target: company.publicId,
            value: 1,
          })),
        // Groups to group-types
        ...groups
          .filter(group => !!group.type)
          .map(group => ({
            source: group.publicId,
            target: group.type?.publicId,
            value: 1,
          })),
        // Users to groups
        ...users.reduce((userLinks, user) => {
          return [
            ...userLinks,
            // Company + Group-specific memberships
            ...user.memberships
              .filter(
                membership =>
                  groups.find(
                    group => group.publicId === membership.group.publicId,
                  )?.name && membership.role,
              )
              .map(membership => ({
                source: user.publicId,
                target: groups.find(
                  group => group.publicId === membership.group.publicId,
                )?.publicId,
                value: 1,
              })),
            // machine-specific memberships
            ...(settings.showMachineSpecific
              ? user.memberships
                  .filter(
                    membership =>
                      !!machineGroups.find(
                        group => group.publicId === membership.group.publicId,
                      ),
                  )
                  .map(membership => ({
                    source: user.publicId,
                    target: machineGroups.find(
                      group => group.publicId === membership.group.publicId,
                    )?.agent.publicId,
                    value: 1,
                  }))
              : []),
          ];
        }, []),
        // Agents to groups
        ...agents.reduce((agentLinks, agent) => {
          return [
            ...agentLinks,
            ...agent.memberships
              .filter(
                membership =>
                  groups.find(
                    group => group.publicId === membership.group.publicId,
                  )?.name,
              )
              .map(membership => ({
                source: agent.publicId,
                target: groups.find(
                  group => group.publicId === membership.group.publicId,
                )?.publicId,
                value: 1,
              })),
          ];
        }, []),
      ],
    };

    // Filter out nodes that are not linked
    return {
      nodes: pre_graph.nodes.filter(node =>
        pre_graph.links.find(
          link => link.source === node.id || link.target === node.id,
        ),
      ),
      links: pre_graph.links,
    };
  }

  function drawLegend() {
    if (settings.showLegend) {
      labels = [
        { name: 'Device', color: color(4) },
        { name: 'User', color: color(3) },
        { name: 'Group', color: color(2) },
        { name: 'Group-type', color: color(1) },
        { name: 'Company', color: '#000' },
      ];
      legend = legendSvg.data(labels);
      const legendaItem = legend.enter().append('g');

      legendaItem
        .append('circle')
        .attr('r', 6)
        .attr('cx', 6)
        .attr('cy', '100%')
        .attr('transform', (d, i) => 'translate(0 ' + -(i * 20 + 6) + ')')
        .attr('fill', 'white')
        .style('fill', (d, i) => labels[i].color);

      legendaItem
        .append('text')
        .attr('x', 20)
        .attr('y', '100%')
        .attr('transform', (d, i) => 'translate(0 ' + -(i * 20 + 1) + ')')
        .text((d, i) => labels[i].name)
        .style('font-size', '15px')
        .style('pointer-events', 'none')
        .style('user-select', 'none');
    }
  }

  function calculateConnectedEdgesAndHighlightElements() {
    focusedConnectedEdges = [];

    // user
    if (clickedNode.group === 3) {
      var edges = graph.links.filter(function (e) {
        return e.source.id === clickedNode.id || e.target.id === clickedNode.id;
      });
      var connectedNodes = graph.nodes.filter(
        node =>
          node.id !== clickedNode.id &&
          edges.find(
            edge => edge.source.id === node.id || edge.target.id === node.id,
          ) &&
          node.group === 2,
      );
      var agentNodes = graph.nodes.filter(node => node.group === 4);
      var edgesFromGroupsToAgents = graph.links.filter(function (e) {
        return (
          (e.source.id !== clickedNode.id &&
            connectedNodes.find(node => node.id === e.target.id) &&
            agentNodes.find(node => node.id === e.source.id)) ||
          (connectedNodes.find(node => node.id === e.source.id) &&
            e.target.id !== clickedNode.id &&
            agentNodes.find(node => node.id === e.target.id))
        );
      });
      focusedConnectedEdges = [...edges, ...edgesFromGroupsToAgents];
    }

    // agent
    if (clickedNode.group === 4) {
      var edges = graph.links.filter(function (e) {
        return e.source.id === clickedNode.id || e.target.id === clickedNode.id;
      });
      var connectedNodes = graph.nodes.filter(
        node =>
          node.id !== clickedNode.id &&
          edges.find(
            edge => edge.source.id === node.id || edge.target.id === node.id,
          ) &&
          node.group === 2,
      );
      var userNodes = graph.nodes.filter(node => node.group === 3);
      var edgesFromGroupsToUsers = graph.links.filter(function (e) {
        return (
          (e.source.id !== clickedNode.id &&
            connectedNodes.find(node => node.id === e.target.id) &&
            userNodes.find(node => node.id === e.source.id)) ||
          (connectedNodes.find(node => node.id === e.source.id) &&
            e.target.id !== clickedNode.id &&
            userNodes.find(node => node.id === e.target.id))
        );
      });
      focusedConnectedEdges = [...edges, ...edgesFromGroupsToUsers];
    }
    focusElements();
  }

  function focusElements() {
    circle.attr('opacity', function (n) {
      return focusedConnectedEdges.map(d => d.source.id).indexOf(n.id) > -1 ||
        focusedConnectedEdges.map(d => d.target.id).indexOf(n.id) > -1
        ? 1
        : 0.1;
    });

    label.attr('opacity', function (n) {
      return focusedConnectedEdges.map(d => d.source.id).indexOf(n.id) > -1 ||
        focusedConnectedEdges.map(d => d.target.id).indexOf(n.id) > -1
        ? 1
        : 0;
    });

    link.attr('opacity', function (d) {
      return focusedConnectedEdges.find(
        edge =>
          edge.source.id === d.source.id && edge.target.id === d.target.id,
      )
        ? 1
        : 0.1;
    });
  }

  async function openSettingsDialog() {
    const result = await context.openFormDialog({
      title: 'Settings',
      inputs: [
        {
          key: 'showCompanyWide',
          type: 'Checkbox',
          label: 'Show company-wide user access',
        },
        {
          key: 'showMachineSpecific',
          type: 'Checkbox',
          label: 'Show machine-specific user access',
        },
        {
          key: 'showLabels',
          type: 'Checkbox',
          label: 'Show labels',
        },
        {
          key: 'showLegend',
          type: 'Checkbox',
          label: 'Show legend',
        },
      ],
      initialValue: {
        ...settings,
      },
      submitButtonText: 'Confirm',
    });
    if (result && result.value) {
      updateSettings(result.value);
    }
  }

  function updateSettings(newSettings: {
    showCompanyWide: boolean;
    showMachineSpecific: boolean;
    showLabels: boolean;
    showLegend: boolean;
  }) {
    settings = newSettings;
    resetGraph();
    if (clickedNode) {
      calculateConnectedEdgesAndHighlightElements();
    }
  }

  function resetGraph() {
    legend.enter().selectAll('g').remove();
    svg.selectAll('circle').remove();
    svg.selectAll('text').remove();
    svg.selectAll('line').remove();
    drawGraph();
    drawLegend();
    if (focusedConnectedEdges.length > 0) {
      focusElements();
    }
  }

  function resetHighlight() {
    searchInput = '';
    clickedNode = null;
    focusedConnectedEdges = [];
    circle.attr('opacity', function (n) {
      return 1;
    });

    label.attr('opacity', function (n) {
      return 1;
    });

    link.attr('opacity', function (d) {
      return 1;
    });
  }

  /**
   * Search functionality
   */
  const typeahead = () => {
    let resultsIncludes = possibleResults.filter((possibleResult: any) =>
      possibleResult.name.toLowerCase().includes(searchInput.toLowerCase()),
    ) as any;
    results = resultsIncludes
      .sort((a, b) => a.name.localeCompare(b))
      .slice(0, 10);
    results = [...new Set(results)];
  };

  const newSearchInput = node => {
    searchInput = node.name;
    typeahead();
    clickedNode = node;
    calculateConnectedEdgesAndHighlightElements();
  };

  document.addEventListener('keydown', e => {
    if (isInputFocused) {
      if (e.key === 'ArrowDown') {
        selectedSearchIndex++;
        if (selectedSearchIndex >= results.length) {
          selectedSearchIndex = 0;
        }
      }
      if (e.key === 'ArrowUp') {
        selectedSearchIndex--;
        if (selectedSearchIndex < 0) {
          selectedSearchIndex = results.length - 1;
        }
      }
      if (e.key === 'Enter' && selectedSearchIndex > -1) {
        newSearchInput(results[selectedSearchIndex]);
        searchEl.blur();
      }
    }
  });
</script>

<div class="card" bind:this={rootEl}>
  <div>
    <div class="search-input">
      <input
        placeholder="Search"
        bind:this={searchEl}
        bind:value={searchInput}
        on:input={typeahead}
        on:focus={onInputFocus}
        on:blur={onInputBlur}
      />
      <ul class="typeahead-object-list">
        {#if isInputFocused === true}
          {#if searchInput.length !== 0}
            {#each results as node, index}
              <li
                class:focused={index === selectedSearchIndex}
                class="typeahead-objects"
                on:mousedown={() => newSearchInput(node)}
              >
                <span>{node.name}</span>
                <span>{node.group === 3 ? '(User)' : '(Device)'}</span>
              </li>
            {/each}
          {/if}
        {/if}
      </ul>
      <button
        class="icon-button reset"
        class:hidden={!clickedNode}
        bind:this={resetButton}
        on:click={resetHighlight}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="24px"
          viewBox="0 0 24 24"
          width="24px"
          fill="#000000"
          ><path d="M0 0h24v24H0z" fill="none" /><path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          /></svg
        >
      </button>
    </div>
    <button
      class="icon-button settings"
      on:click={openSettingsDialog}
      bind:this={settingsButton}
    >
      <svg width="24" height="24" viewBox="0 0 24 24"
        ><path fill="none" d="M0 0h24v24H0V0z" /><path
          d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.09-.16-.26-.25-.44-.25-.06 0-.12.01-.17.03l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.06-.02-.12-.03-.18-.03-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.09.16.26.25.44.25.06 0 .12-.01.17-.03l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-1.98-1.71c.04.31.05.52.05.73 0 .21-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7.14 1.13zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
        /></svg
      >
    </button>
  </div>

  <div class="card-content">
    <div class="svg-container" bind:this={el} />
  </div>
</div>

<style lang="scss">
  @import './styles/card';
  @import './styles/button';

  .card {
    padding: 8px;
    height: 100%;

    .search-input {
      position: absolute;
      left: 16px;
      top: 16px;

      input {
        width: 150px;
        height: 25px;
        padding: 0px 35px 0px 5px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        outline: none;
      }

      input:focus {
        border: 1px solid lightgray;
      }

      ul {
        padding-left: 0;
        position: absolute;
        margin: 0;
        margin-top: 4px;
        width: 100%;

        li.typeahead-objects:first-of-type {
          border-top: 1px solid rgba(0, 0, 0, 0.12);
        }
        li.typeahead-objects {
          list-style: none;
          border-bottom: 1px solid rgba(0, 0, 0, 0.12);
          border-right: 1px solid rgba(0, 0, 0, 0.12);
          border-left: 1px solid rgba(0, 0, 0, 0.12);
          margin: 0;
          padding: 8px;
          cursor: pointer;
          background-color: #fff;
          display: block;

          &.focused {
            background-color: #f5f5f5;
          }
        }
        li.typeahead-objects:hover {
          background-color: #f5f5f5;
        }
      }
    }

    .icon-button {
      position: absolute;

      &.settings {
        margin-top: 2px;
        right: 8px;
      }

      &.reset {
        margin-top: -6px;
        left: 153px;
        top: 0;
      }

      &.hidden {
        visibility: hidden;
      }
    }

    label {
      margin-right: 8px;
    }
  }

  .svg-container {
    width: 100%;
    height: calc(100% - 20px);
  }
</style>
