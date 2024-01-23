import type { Agent, ComponentContext, Group, GroupType, MyCompany, User } from '@ixon-cdk/types';

export class UserAccessGraphService {
  context: ComponentContext;

  constructor(context: ComponentContext) {
    this.context = context;
  }

  getGroupTypes(): Promise<GroupType> {
    const url = new URL(this.context.getApiUrl('GroupTypeList'));
    const params = { fields: 'publicId,name', 'page-size': 4000 };

    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const headers = this.getHeaders();
    return fetch(url.toString(), { method: 'GET', headers }).then(res => res.json().then(res => res.data || []));
  }

  getGroups(): Promise<Group> {
    const url = new URL(this.context.getApiUrl('GroupList'));
    const params = {
      fields: 'agent,publicId,name,type.publicId,type.name',
      'page-size': 4000,
    };

    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const headers = this.getHeaders();
    return fetch(url.toString(), { method: 'GET', headers }).then(res => res.json().then(res => res.data || []));
  }

  getAgents(): Promise<Agent> {
    const url = new URL(this.context.getApiUrl('AgentList'));
    const params = {
      fields: '*,memberships.group.publicId',
      'page-size': 4000,
    };

    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const headers = this.getHeaders();
    return fetch(url.toString(), { method: 'GET', headers }).then(res => res.json().then(res => res.data || []));
  }

  getUsers(): Promise<User> {
    const url = new URL(this.context.getApiUrl('UserList'));
    const params = {
      fields: '*,memberships.group.publicId,memberships.role.publicId',
      'page-size': 4000,
    };

    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const headers = this.getHeaders();
    return fetch(url.toString(), { method: 'GET', headers }).then(res => res.json().then(res => res.data || []));
  }

  getMyCompany(): Promise<MyCompany> {
    const url = new URL(this.context.getApiUrl('MyCompany'));
    const params = { fields: 'name' };

    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const headers = this.getHeaders();
    return fetch(url.toString(), { method: 'GET', headers }).then(res => res.json().then(res => res.data || []));
  }

  private getHeaders() {
    return {
      'Api-Application': this.context.appData.apiAppId,
      'Api-Version': this.context.appData.apiVersion,
      'Api-Company': this.context.appData.company.publicId,
      Authorization: `Bearer ${this.context.appData.accessToken.secretId}`,
    };
  }
}
